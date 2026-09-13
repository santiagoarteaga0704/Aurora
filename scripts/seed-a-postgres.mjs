/**
 * Convierte database/seed.mysql.sql a PostgreSQL.
 *
 * Lo unico que el seed necesita traducir es lo siguiente:
 *
 *  1. `USE aurora;` no existe en Postgres.
 *  2. Los TINYINT(1) pasaron a BOOLEAN, asi que los 0 y 1 posicionales de los
 *     INSERT tienen que volverse FALSE y TRUE. Las posiciones se deducen
 *     cruzando la lista de columnas de cada INSERT con el mapa de columnas
 *     booleanas que dejo el conversor del esquema.
 *  3. Las 8 plantillas de reporte guardan SQL como texto. Ese SQL lo ejecuta
 *     el modulo de reportes, asi que tiene que ser SQL de Postgres: se
 *     reescribe aparte en scripts/plantillas-reporte-postgres.mjs.
 *  4. Varias tablas se siembran con id explicito. En Postgres eso no adelanta
 *     la secuencia de la columna IDENTITY, asi que el primer INSERT de la
 *     aplicacion chocaria con una clave duplicada. Al final se resincronizan
 *     todas las secuencias.
 *
 * La salida queda como maestro: de aqui en adelante se edita
 * database/seed.postgres.sql, no el de MySQL, que se conserva solo como
 * registro de la migracion.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PLANTILLAS_POSTGRES } from './plantillas-reporte-postgres.mjs'

const booleanas = JSON.parse(readFileSync('database/columnas-booleanas.json', 'utf8'))

let sql = readFileSync('database/seed.mysql.sql', 'utf8').replace(/\r\n/g, '\n')

sql = sql.replace(/^USE .*;\n/gim, '')

/**
 * Parte una lista de valores SQL respetando las cadenas entre comillas simples
 * (con '' como escape) y los parentesis anidados. Un split por comas romperia
 * cualquier descripcion que contenga una coma.
 */
function partirValores(txt) {
  const salida = []
  let actual = ''
  let enCadena = false
  let nivel = 0
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (enCadena) {
      actual += c
      if (c === "'") {
        if (txt[i + 1] === "'") {
          actual += txt[++i]
        } else {
          enCadena = false
        }
      }
      continue
    }
    if (c === "'") {
      enCadena = true
      actual += c
      continue
    }
    if (c === '(') nivel++
    if (c === ')') nivel--
    if (c === ',' && nivel === 0) {
      salida.push(actual)
      actual = ''
      continue
    }
    actual += c
  }
  if (actual.trim() !== '') salida.push(actual)
  return salida
}

/** Separa los grupos `( ... )` de un bloque VALUES, respetando cadenas. */
function partirTuplas(txt) {
  const tuplas = []
  let actual = null
  let enCadena = false
  let nivel = 0
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (enCadena) {
      actual += c
      if (c === "'") {
        if (txt[i + 1] === "'") actual += txt[++i]
        else enCadena = false
      }
      continue
    }
    if (c === '(') {
      nivel++
      if (nivel === 1) {
        actual = ''
        continue
      }
    }
    if (c === ')') {
      nivel--
      if (nivel === 0) {
        tuplas.push(actual)
        actual = null
        continue
      }
    }
    if (nivel >= 1) {
      actual += c
      if (c === "'") enCadena = true
    }
  }
  return tuplas
}

// --- 1. booleanos posicionales ----------------------------------------------
let insertsTocados = 0
let valoresTocados = 0

sql = sql.replace(
  /INSERT INTO (\w+)\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);\n/g,
  (completo, tabla, listaCols, bloque) => {
    const cols = listaCols.split(',').map((c) => c.trim())
    const boolsDeTabla = booleanas[tabla] ?? []
    const posiciones = cols
      .map((c, i) => (boolsDeTabla.includes(c) ? i : -1))
      .filter((i) => i >= 0)

    if (posiciones.length === 0) return completo

    const tuplas = partirTuplas(bloque)
    const nuevas = tuplas.map((t) => {
      const vals = partirValores(t)
      for (const p of posiciones) {
        if (p >= vals.length) continue
        const v = vals[p].trim()
        if (v === '1') {
          vals[p] = vals[p].replace('1', 'TRUE')
          valoresTocados++
        } else if (v === '0') {
          vals[p] = vals[p].replace('0', 'FALSE')
          valoresTocados++
        }
      }
      return `(${vals.join(',')})`
    })

    insertsTocados++
    return `INSERT INTO ${tabla} (${listaCols}) VALUES\n ${nuevas.join(',\n ')};\n`
  }
)

// --- 2. plantillas de reporte -----------------------------------------------
// Se reemplaza el INSERT completo por la version escrita para Postgres: el SQL
// de dentro no es convertible con sustituciones ciegas.
const reInsertPlantillas = /INSERT INTO plantilla_reporte[\s\S]*?\n\);\n/
if (!reInsertPlantillas.test(sql)) {
  throw new Error('No se encontro el INSERT de plantilla_reporte en el seed de MySQL')
}
sql = sql.replace(reInsertPlantillas, PLANTILLAS_POSTGRES)

// --- 3. resincronizar las secuencias ----------------------------------------
const resync = `
-- ============================================================================
-- RESINCRONIZACION DE SECUENCIAS
-- ============================================================================
-- Varias tablas de arriba se siembran con id explicito. En Postgres eso no
-- adelanta la secuencia de la columna IDENTITY, asi que el primer INSERT de la
-- aplicacion intentaria reusar el id 1 y fallaria por clave duplicada. Este
-- bloque deja cada secuencia apuntando al siguiente id libre.
DO $sync$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND is_identity = 'YES'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
      r.table_name, r.column_name, r.column_name, r.table_name
    );
  END LOOP;
END
$sync$;
`

const cabecera = `-- ${'='.repeat(76)}
--  AURORA  -  Datos iniciales (catalogos maestros y usuario administrador)
--  Motor: PostgreSQL 16   -   Ejecutar DESPUES de schema.postgres.sql
-- ${'='.repeat(76)}
--  Primera version generada por scripts/seed-a-postgres.mjs desde
--  seed.mysql.sql. De aqui en adelante este archivo es el maestro.
-- ${'='.repeat(76)}
`

sql = sql.replace(/^--[\s\S]*?={20,}\n/, cabecera)

writeFileSync('database/seed.postgres.sql', sql.trimEnd() + '\n' + resync)

console.log(`INSERT con booleanos ajustados : ${insertsTocados}`)
console.log(`valores 0/1 -> FALSE/TRUE      : ${valoresTocados}`)
console.log('plantillas de reporte          : reescritas para Postgres')
console.log('-> database/seed.postgres.sql')
