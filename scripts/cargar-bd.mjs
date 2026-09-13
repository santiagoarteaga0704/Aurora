/**
 * Recarga la base desde cero: borra el esquema, aplica
 * database/schema.postgres.sql y siembra database/seed.postgres.sql.
 *
 *   node scripts/cargar-bd.mjs            (usa el contenedor aurora-db)
 *   AURORA_PSQL="psql -U aurora -d aurora" node scripts/cargar-bd.mjs
 *
 * Sirve para volver a un estado conocido despues de probar, y es lo que se
 * ejecuta contra Azure la primera vez que se levanta el entorno.
 *
 * OJO: borra todos los datos. No apuntar a produccion con datos reales.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const ESQUEMA = 'database/schema.postgres.sql'
const SEMILLA = 'database/seed.postgres.sql'

for (const archivo of [ESQUEMA, SEMILLA]) {
  if (!existsSync(archivo)) {
    console.error(`Falta ${archivo}. Generarlo con: npm run db:generar`)
    process.exit(1)
  }
}

/**
 * Por defecto se habla con el contenedor de Docker. La variable AURORA_PSQL
 * permite apuntar a un psql instalado o a la base de Azure sin tocar el script.
 */
const comando = process.env.AURORA_PSQL
  ? process.env.AURORA_PSQL.split(' ')
  : ['docker', 'exec', '-i', 'aurora-db', 'psql', '-U', 'aurora', '-d', 'aurora']

function ejecutar(sql, titulo) {
  process.stdout.write(`${titulo}... `)
  try {
    const salida = execFileSync(comando[0], [...comando.slice(1), '-v', 'ON_ERROR_STOP=1', '-q'], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log('listo')
    return salida
  } catch (e) {
    console.log('FALLO')
    console.error(e.stderr || e.message)
    process.exit(1)
  }
}

ejecutar('DROP SCHEMA public CASCADE; CREATE SCHEMA public;', 'Vaciando el esquema')
ejecutar(readFileSync(ESQUEMA, 'utf8'), 'Creando 54 tablas, 39 enums y 2 vistas')
ejecutar(readFileSync(SEMILLA, 'utf8'), 'Sembrando catalogos maestros')

const recuento = ejecutar(
  `SELECT
     (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tablas,
     (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS vistas,
     (SELECT count(*) FROM pg_type WHERE typtype='e') AS enums,
     (SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public') AS claves_ajenas,
     (SELECT count(*) FROM rol) AS roles,
     (SELECT count(*) FROM permiso) AS permisos,
     (SELECT count(*) FROM plantilla_reporte) AS plantillas;`,
  'Verificando'
)

console.log(`\n${recuento.trim()}`)
console.log('\nBase lista. Credenciales: admin@aurora.bo / Aurora2026!')
console.log('Recordar: despues de recargar hay que reiniciar la API,')
console.log('porque Prisma mantiene sentencias preparadas contra el esquema viejo.')
