/**
 * Convierte un nombre en un slug apto para la URL.
 *
 * Se quitan los acentos antes de filtrar: sin eso, "Vestido Ceñido" perderia la
 * enie y quedaria "vestido-ceido" en lugar de "vestido-cenido".
 */
export function aSlug(texto: string, largoMaximo = 90): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, largoMaximo)
}

/**
 * Devuelve un slug que no choque con los ya usados, agregando un sufijo
 * numerico. `existentes` son los slugs que ya empiezan igual.
 */
export function slugUnico(base: string, existentes: readonly string[], largoMaximo = 90): string {
  if (!existentes.includes(base)) return base

  for (let n = 2; n < 1000; n++) {
    const sufijo = `-${n}`
    const candidato = `${base.slice(0, largoMaximo - sufijo.length)}${sufijo}`
    if (!existentes.includes(candidato)) return candidato
  }
  // Con mil productos del mismo nombre, algo mas raro pasa; igual no se cuelga.
  return `${base.slice(0, largoMaximo - 7)}-${Date.now().toString(36).slice(-6)}`
}
