import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type {
  DatosActualizarProducto,
  DatosActualizarVariante,
  DatosBusquedaCatalogo,
  DatosCrearProducto,
  DatosCrearVariante,
  DatosEscalasPrecio,
  DatosImagen,
  ProductoFicha,
  ProductoResumen,
  VarianteResumen,
} from '@aurora/contratos'
import { salto } from '@aurora/contratos'
import { PrismaService } from '../../nucleo/prisma/prisma.service'
import { ExcepcionNegocio } from '../../nucleo/errores/excepcion-negocio'
import { BitacoraService, type ContextoPeticion } from '../../nucleo/bitacora/bitacora.service'
import { aSlug, slugUnico } from '../../nucleo/util/texto'
import { aNumero } from '../../nucleo/util/decimal'
import type { UsuarioAutenticado } from '../../nucleo/autenticacion/tipos'

/** Cuanto paga quien esta mirando el catalogo. */
type ListaPrecio = 'menor' | 'mayor'

@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitacora: BitacoraService
  ) {}

  // ==========================================================================
  // Busqueda
  // ==========================================================================

  /**
   * Busqueda del catalogo con todos los filtros combinables.
   *
   * Se resuelve en SQL y no con el constructor de consultas de Prisma por dos
   * razones: el texto libre necesita el indice GIN de `to_tsvector`, que Prisma
   * no sabe expresar, y el orden por precio necesita el minimo de las variantes
   * del producto. Las condiciones se arman con `Prisma.sql`, asi que todos los
   * valores viajan como parametros y no hay concatenacion de cadenas.
   */
  async buscar(filtros: DatosBusquedaCatalogo, usuario: UsuarioAutenticado | null) {
    const lista = await this.listaDePrecio(usuario)
    const condiciones: Prisma.Sql[] = []

    if (!filtros.incluir_inactivos) {
      condiciones.push(Prisma.sql`p.activo = TRUE`)
    }

    if (filtros.q) {
      // La expresion se escribe igual que el indice ft_producto del esquema; si
      // se cambia una hay que cambiar la otra o se deja de usar el indice.
      condiciones.push(
        Prisma.sql`to_tsvector('spanish', coalesce(p.nombre, '') || ' ' || coalesce(p.descripcion, '') || ' ' || coalesce(p.material, ''))
                   @@ plainto_tsquery('spanish', ${filtros.q})`
      )
    }

    if (filtros.categoria_id) {
      // Filtrar por una categoria incluye sus hijas: quien entra a "Vestidos"
      // espera ver tambien los de "Vestidos de fiesta".
      const ids = await this.categoriaConDescendientes(filtros.categoria_id)
      condiciones.push(Prisma.sql`p.categoria_id IN (${Prisma.join(ids)})`)
    }

    if (filtros.marca_id) condiciones.push(Prisma.sql`p.marca_id = ${filtros.marca_id}`)
    if (filtros.temporada)
      condiciones.push(Prisma.sql`p.temporada = ${filtros.temporada}::producto_temporada`)
    if (filtros.tipo_prenda)
      condiciones.push(Prisma.sql`p.tipo_prenda = ${filtros.tipo_prenda}::producto_tipo_prenda`)
    if (filtros.destacado !== undefined)
      condiciones.push(Prisma.sql`p.destacado = ${filtros.destacado}`)

    // Talla, color y precio son propiedades de la variante, no del producto: se
    // pregunta si EXISTE alguna variante que cumpla.
    const porVariante: Prisma.Sql[] = []
    if (filtros.talla_id) porVariante.push(Prisma.sql`v.talla_id = ${filtros.talla_id}`)
    if (filtros.color_id) porVariante.push(Prisma.sql`v.color_id = ${filtros.color_id}`)
    if (filtros.precio_min !== undefined)
      porVariante.push(Prisma.sql`v.precio_menor >= ${filtros.precio_min}`)
    if (filtros.precio_max !== undefined)
      porVariante.push(Prisma.sql`v.precio_menor <= ${filtros.precio_max}`)

    if (porVariante.length > 0) {
      condiciones.push(
        Prisma.sql`EXISTS (SELECT 1 FROM variante v
                           WHERE v.producto_id = p.id AND v.activo = TRUE
                             AND ${Prisma.join(porVariante, ' AND ')})`
      )
    }

    const donde =
      condiciones.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(condiciones, ' AND ')}`
        : Prisma.empty

    const total = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM producto p ${donde}
    `

    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM producto p
      ${donde}
      ORDER BY ${this.ordenSql(filtros)}
      LIMIT ${filtros.por_pagina} OFFSET ${salto(filtros)}
    `

    const ids = filas.map((f) => f.id)
    return {
      items: await this.resumirProductos(ids, lista),
      total: Number(total[0]?.total ?? 0),
    }
  }

  private ordenSql(filtros: DatosBusquedaCatalogo): Prisma.Sql {
    const precioMinimo = Prisma.sql`(SELECT MIN(v.precio_menor) FROM variante v WHERE v.producto_id = p.id AND v.activo = TRUE)`

    switch (filtros.orden) {
      case 'nombre':
        return Prisma.sql`p.nombre ASC`
      case 'precio_asc':
        return Prisma.sql`${precioMinimo} ASC NULLS LAST, p.nombre ASC`
      case 'precio_desc':
        return Prisma.sql`${precioMinimo} DESC NULLS LAST, p.nombre ASC`
      case 'novedades':
        return Prisma.sql`p.creado_en DESC, p.id DESC`
      case 'mas_vendidos':
        return Prisma.sql`p.vendidos DESC, p.calificacion DESC`
      case 'relevancia':
      default:
        // Con texto buscado manda la coincidencia; sin texto, la vidriera:
        // primero lo destacado, despues lo que mas se vende.
        return filtros.q
          ? Prisma.sql`ts_rank(to_tsvector('spanish', coalesce(p.nombre, '') || ' ' || coalesce(p.descripcion, '') || ' ' || coalesce(p.material, '')),
                               plainto_tsquery('spanish', ${filtros.q})) DESC, p.vendidos DESC`
          : Prisma.sql`p.destacado DESC, p.vendidos DESC, p.id DESC`
    }
  }

  /** Ids de una categoria y de todas sus descendientes. */
  private async categoriaConDescendientes(categoriaId: number): Promise<number[]> {
    const filas = await this.prisma.$queryRaw<{ id: number }[]>`
      WITH RECURSIVE arbol AS (
        SELECT id FROM categoria WHERE id = ${categoriaId}
        UNION ALL
        SELECT c.id FROM categoria c JOIN arbol a ON c.padre_id = a.id
      )
      SELECT id FROM arbol
    `
    // Si la categoria no existe se devuelve un id imposible, para que la
    // busqueda no traiga el catalogo entero por un filtro mal escrito.
    return filas.length > 0 ? filas.map((f) => f.id) : [-1]
  }

  // ==========================================================================
  // Ficha
  // ==========================================================================

  async ficha(slug: string, usuario: UsuarioAutenticado | null): Promise<ProductoFicha> {
    const lista = await this.listaDePrecio(usuario)

    const p = await this.prisma.producto.findUnique({
      where: { slug },
      include: {
        categoria: { select: { nombre: true } },
        marca: { select: { nombre: true } },
        producto_imagen: { orderBy: [{ es_principal: 'desc' }, { orden: 'asc' }] },
        variante: {
          include: {
            talla: { select: { nombre: true, orden: true } },
            color: { select: { nombre: true, hex: true } },
            escala_precio: { orderBy: { cantidad_min: 'asc' } },
            inventario: { select: { stock: true, stock_reservado: true } },
          },
          orderBy: [{ talla: { orden: 'asc' } }, { color: { nombre: 'asc' } }],
        },
      },
    })

    if (!p) throw ExcepcionNegocio.noEncontrado('Ese producto no existe')

    const variantes: VarianteResumen[] = p.variante.map((v) => ({
      id: v.id,
      sku: v.sku,
      talla: v.talla.nombre,
      color: v.color.nombre,
      color_hex: v.color.hex,
      precio_menor: aNumero(v.precio_menor),
      precio_mayor: aNumero(v.precio_mayor),
      precio: aNumero(lista === 'mayor' ? v.precio_mayor : v.precio_menor),
      disponible: v.inventario.reduce((s, i) => s + i.stock - i.stock_reservado, 0),
      activo: v.activo,
    }))

    const escalas: ProductoFicha['escalas'] = {}
    for (const v of p.variante) {
      if (v.escala_precio.length > 0) {
        escalas[v.id] = v.escala_precio.map((e) => ({
          cantidad_min: e.cantidad_min,
          precio_unitario: aNumero(e.precio_unitario),
        }))
      }
    }

    const precios = variantes.filter((v) => v.activo).map((v) => v.precio)

    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      slug: p.slug,
      categoria: p.categoria.nombre,
      marca: p.marca?.nombre ?? null,
      temporada: p.temporada,
      tipo_prenda: p.tipo_prenda,
      destacado: p.destacado,
      activo: p.activo,
      imagen: p.producto_imagen[0]?.url ?? null,
      precio_desde: precios.length > 0 ? Math.min(...precios) : 0,
      precio_hasta: precios.length > 0 ? Math.max(...precios) : 0,
      disponible: variantes.reduce((s, v) => s + v.disponible, 0),
      calificacion: aNumero(p.calificacion),
      descripcion: p.descripcion,
      material: p.material,
      cuidados: p.cuidados,
      vendidos: p.vendidos,
      imagenes: p.producto_imagen.map((i) => ({
        url: i.url,
        alt: i.alt,
        color_id: i.color_id,
        es_principal: i.es_principal,
      })),
      variantes,
      escalas,
    }
  }

  /** Hidrata la pagina de resultados respetando el orden que trajo el SQL. */
  private async resumirProductos(ids: number[], lista: ListaPrecio): Promise<ProductoResumen[]> {
    if (ids.length === 0) return []

    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids } },
      include: {
        categoria: { select: { nombre: true } },
        marca: { select: { nombre: true } },
        producto_imagen: {
          where: { es_principal: true },
          take: 1,
          select: { url: true },
        },
        variante: {
          where: { activo: true },
          select: {
            precio_menor: true,
            precio_mayor: true,
            inventario: { select: { stock: true, stock_reservado: true } },
          },
        },
      },
    })

    const porId = new Map(productos.map((p) => [p.id, p]))

    return ids
      .map((id) => porId.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .map((p) => {
        const precios = p.variante.map((v) =>
          aNumero(lista === 'mayor' ? v.precio_mayor : v.precio_menor)
        )
        return {
          id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          slug: p.slug,
          categoria: p.categoria.nombre,
          marca: p.marca?.nombre ?? null,
          temporada: p.temporada,
          tipo_prenda: p.tipo_prenda,
          destacado: p.destacado,
          activo: p.activo,
          imagen: p.producto_imagen[0]?.url ?? null,
          precio_desde: precios.length > 0 ? Math.min(...precios) : 0,
          precio_hasta: precios.length > 0 ? Math.max(...precios) : 0,
          disponible: p.variante.reduce(
            (s, v) => s + v.inventario.reduce((t, i) => t + i.stock - i.stock_reservado, 0),
            0
          ),
          calificacion: aNumero(p.calificacion),
        }
      })
  }

  /**
   * Un mayorista aprobado ve los precios de mayoreo; todos los demas, incluido
   * un mayorista todavia sin validar, ven los de menudeo. La decision es del
   * servidor: el cliente no puede pedir "dame los precios de mayoreo".
   */
  private async listaDePrecio(usuario: UsuarioAutenticado | null): Promise<ListaPrecio> {
    if (!usuario) return 'menor'

    const cliente = await this.prisma.cliente.findUnique({
      where: { usuario_id: usuario.id },
      select: { tipo: true, mayorista_aprobado: true },
    })

    return cliente?.tipo === 'mayorista' && cliente.mayorista_aprobado ? 'mayor' : 'menor'
  }

  // ==========================================================================
  // Alta y edicion
  // ==========================================================================

  async crearProducto(datos: DatosCrearProducto, ctx: ContextoPeticion) {
    await this.verificarCodigoLibre(datos.codigo)
    await this.verificarTallasYColores(datos.variantes)

    const skus = datos.variantes.map((v) => v.sku)
    if (new Set(skus).size !== skus.length) {
      throw ExcepcionNegocio.validacion({ variantes: 'Hay dos variantes con el mismo SKU' })
    }
    await this.verificarSkusLibres(skus)

    const slug = await this.slugLibre(datos.nombre)

    const producto = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.producto.create({
        data: {
          categoria_id: datos.categoria_id,
          marca_id: datos.marca_id ?? null,
          codigo: datos.codigo,
          nombre: datos.nombre,
          slug,
          descripcion: datos.descripcion ?? null,
          material: datos.material ?? null,
          cuidados: datos.cuidados ?? null,
          temporada: datos.temporada,
          tipo_prenda: datos.tipo_prenda,
          destacado: datos.destacado,
        },
        select: { id: true, slug: true },
      })

      await tx.variante.createMany({
        data: datos.variantes.map((v) => ({
          producto_id: creado.id,
          talla_id: v.talla_id,
          color_id: v.color_id,
          sku: v.sku,
          codigo_barras: v.codigo_barras ?? null,
          precio_menor: v.precio_menor,
          precio_mayor: v.precio_mayor,
          costo: v.costo,
          peso_gr: v.peso_gr ?? null,
        })),
      })

      return creado
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'catalogo',
      entidad: 'producto',
      entidadId: producto.id,
      descripcion: `Alta de ${datos.nombre} con ${datos.variantes.length} variante(s)`,
      datosNuevos: { codigo: datos.codigo, nombre: datos.nombre },
    })

    return this.ficha(producto.slug, null)
  }

  async actualizarProducto(id: number, datos: DatosActualizarProducto, ctx: ContextoPeticion) {
    const previo = await this.prisma.producto.findUnique({ where: { id } })
    if (!previo) throw ExcepcionNegocio.noEncontrado('Ese producto no existe')

    const actualizado = await this.prisma.producto.update({
      where: { id },
      data: {
        categoria_id: datos.categoria_id,
        marca_id: datos.marca_id,
        nombre: datos.nombre,
        // El slug no se regenera al renombrar: es parte de la URL y cambiarlo
        // rompe los enlaces que ya circulan y lo que tengan cacheado los PWA.
        descripcion: datos.descripcion,
        material: datos.material,
        cuidados: datos.cuidados,
        temporada: datos.temporada,
        tipo_prenda: datos.tipo_prenda,
        destacado: datos.destacado,
        activo: datos.activo,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'catalogo',
      entidad: 'producto',
      entidadId: id,
      descripcion: `Edicion de ${previo.nombre}`,
      datosPrevios: { nombre: previo.nombre, activo: previo.activo },
      datosNuevos: { nombre: actualizado.nombre, activo: actualizado.activo },
    })

    return this.ficha(actualizado.slug, null)
  }

  /**
   * Baja logica. Un producto vendido no se borra nunca: sus lineas de pedido,
   * devoluciones y reportes historicos lo siguen referenciando.
   */
  async darDeBaja(id: number, ctx: ContextoPeticion) {
    const producto = await this.prisma.producto.findUnique({
      where: { id },
      select: { id: true, nombre: true, activo: true },
    })
    if (!producto) throw ExcepcionNegocio.noEncontrado('Ese producto no existe')

    await this.prisma.$transaction([
      this.prisma.producto.update({ where: { id }, data: { activo: false } }),
      // Las variantes tambien: si no, seguirian apareciendo como vendibles en el
      // punto de venta, que busca por SKU y no por producto.
      this.prisma.variante.updateMany({ where: { producto_id: id }, data: { activo: false } }),
    ])

    await this.bitacora.registrar(ctx, {
      accion: 'eliminar',
      modulo: 'catalogo',
      entidad: 'producto',
      entidadId: id,
      descripcion: `Baja de ${producto.nombre}`,
    })
  }

  // ==========================================================================
  // Variantes
  // ==========================================================================

  async agregarVariante(productoId: number, datos: DatosCrearVariante, ctx: ContextoPeticion) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true, nombre: true, slug: true },
    })
    if (!producto) throw ExcepcionNegocio.noEncontrado('Ese producto no existe')

    await this.verificarTallasYColores([datos])
    await this.verificarSkusLibres([datos.sku])

    const repetida = await this.prisma.variante.findFirst({
      where: { producto_id: productoId, talla_id: datos.talla_id, color_id: datos.color_id },
      select: { id: true },
    })
    if (repetida) {
      throw ExcepcionNegocio.conflicto('Ese producto ya tiene una variante con esa talla y color')
    }

    const variante = await this.prisma.variante.create({
      data: {
        producto_id: productoId,
        talla_id: datos.talla_id,
        color_id: datos.color_id,
        sku: datos.sku,
        codigo_barras: datos.codigo_barras ?? null,
        precio_menor: datos.precio_menor,
        precio_mayor: datos.precio_mayor,
        costo: datos.costo,
        peso_gr: datos.peso_gr ?? null,
      },
      select: { id: true, sku: true },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'catalogo',
      entidad: 'variante',
      entidadId: variante.id,
      descripcion: `Variante ${variante.sku} de ${producto.nombre}`,
    })

    return this.ficha(producto.slug, null)
  }

  async actualizarVariante(id: number, datos: DatosActualizarVariante, ctx: ContextoPeticion) {
    const previa = await this.prisma.variante.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        precio_menor: true,
        precio_mayor: true,
        activo: true,
        producto: { select: { slug: true } },
      },
    })
    if (!previa) throw ExcepcionNegocio.noEncontrado('Esa variante no existe')

    if (datos.sku && datos.sku !== previa.sku) await this.verificarSkusLibres([datos.sku])

    const menor = datos.precio_menor ?? aNumero(previa.precio_menor)
    const mayor = datos.precio_mayor ?? aNumero(previa.precio_mayor)
    if (mayor > menor) {
      throw ExcepcionNegocio.validacion({
        precio_mayor: 'El precio de mayoreo no puede ser mayor que el de menudeo',
      })
    }

    await this.prisma.variante.update({
      where: { id },
      data: {
        sku: datos.sku,
        codigo_barras: datos.codigo_barras,
        precio_menor: datos.precio_menor,
        precio_mayor: datos.precio_mayor,
        costo: datos.costo,
        peso_gr: datos.peso_gr,
        activo: datos.activo,
      },
    })

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'catalogo',
      entidad: 'variante',
      entidadId: id,
      descripcion: `Edicion de la variante ${previa.sku}`,
      datosPrevios: {
        precio_menor: aNumero(previa.precio_menor),
        precio_mayor: aNumero(previa.precio_mayor),
      },
      datosNuevos: { precio_menor: menor, precio_mayor: mayor },
    })

    return this.ficha(previa.producto.slug, null)
  }

  /** Reemplaza las escalas de una variante por las que se envian. */
  async definirEscalas(varianteId: number, datos: DatosEscalasPrecio, ctx: ContextoPeticion) {
    const variante = await this.prisma.variante.findUnique({
      where: { id: varianteId },
      select: { id: true, sku: true, precio_mayor: true },
    })
    if (!variante) throw ExcepcionNegocio.noEncontrado('Esa variante no existe')

    const cantidades = datos.escalas.map((e) => e.cantidad_min)
    if (new Set(cantidades).size !== cantidades.length) {
      throw ExcepcionNegocio.validacion({ escalas: 'Hay dos escalas con la misma cantidad minima' })
    }

    // Una escala tiene que mejorar el precio de mayoreo; si no, no es una escala
    // sino un recargo por comprar mas.
    const tope = aNumero(variante.precio_mayor)
    const mala = datos.escalas.find((e) => e.precio_unitario > tope)
    if (mala) {
      throw ExcepcionNegocio.validacion({
        escalas: `La escala de ${mala.cantidad_min} unidades cuesta mas que el precio de mayoreo (${tope})`,
      })
    }

    await this.prisma.$transaction([
      this.prisma.escala_precio.deleteMany({ where: { variante_id: varianteId } }),
      this.prisma.escala_precio.createMany({
        data: datos.escalas.map((e) => ({
          variante_id: varianteId,
          cantidad_min: e.cantidad_min,
          precio_unitario: e.precio_unitario,
        })),
      }),
    ])

    await this.bitacora.registrar(ctx, {
      accion: 'actualizar',
      modulo: 'catalogo',
      entidad: 'variante',
      entidadId: varianteId,
      descripcion: `${datos.escalas.length} escala(s) de precio en ${variante.sku}`,
    })

    return this.prisma.escala_precio.findMany({
      where: { variante_id: varianteId },
      orderBy: { cantidad_min: 'asc' },
    })
  }

  // ==========================================================================
  // Imagenes
  // ==========================================================================

  async agregarImagen(productoId: number, datos: DatosImagen, ctx: ContextoPeticion) {
    const producto = await this.prisma.producto.findUnique({
      where: { id: productoId },
      select: { id: true, slug: true },
    })
    if (!producto) throw ExcepcionNegocio.noEncontrado('Ese producto no existe')

    await this.prisma.$transaction(async (tx) => {
      // Solo puede haber una imagen principal por producto: es la que se ve en
      // la grilla del catalogo y en el carrito.
      if (datos.es_principal) {
        await tx.producto_imagen.updateMany({
          where: { producto_id: productoId },
          data: { es_principal: false },
        })
      }
      await tx.producto_imagen.create({
        data: {
          producto_id: productoId,
          color_id: datos.color_id ?? null,
          url: datos.url,
          alt: datos.alt ?? null,
          orden: datos.orden,
          es_principal: datos.es_principal,
        },
      })
    })

    await this.bitacora.registrar(ctx, {
      accion: 'crear',
      modulo: 'catalogo',
      entidad: 'producto_imagen',
      entidadId: productoId,
      descripcion: 'Imagen agregada',
    })

    return this.ficha(producto.slug, null)
  }

  async quitarImagen(imagenId: number, ctx: ContextoPeticion) {
    const imagen = await this.prisma.producto_imagen.findUnique({ where: { id: imagenId } })
    if (!imagen) throw ExcepcionNegocio.noEncontrado('Esa imagen no existe')

    await this.prisma.producto_imagen.delete({ where: { id: imagenId } })

    await this.bitacora.registrar(ctx, {
      accion: 'eliminar',
      modulo: 'catalogo',
      entidad: 'producto_imagen',
      entidadId: imagenId,
      descripcion: `Imagen quitada del producto ${imagen.producto_id}`,
    })
  }

  // ==========================================================================
  // Maestros
  // ==========================================================================

  /** Categorias en arbol, como las pinta el menu de la tienda. */
  async categorias() {
    const filas = await this.prisma.categoria.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: { id: true, padre_id: true, nombre: true, slug: true, imagen: true, orden: true },
    })

    type Nodo = (typeof filas)[number] & { hijas: Nodo[] }
    const porId = new Map<number, Nodo>(filas.map((c) => [c.id, { ...c, hijas: [] }]))
    const raiz: Nodo[] = []

    for (const nodo of porId.values()) {
      const padre = nodo.padre_id === null ? null : porId.get(nodo.padre_id)
      if (padre) padre.hijas.push(nodo)
      else raiz.push(nodo)
    }

    return raiz
  }

  marcas() {
    return this.prisma.marca.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, slug: true, logo: true },
    })
  }

  tallas() {
    return this.prisma.talla.findMany({
      orderBy: [{ tipo: 'asc' }, { orden: 'asc' }],
      select: { id: true, nombre: true, tipo: true, orden: true },
    })
  }

  colores() {
    return this.prisma.color.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, hex: true },
    })
  }

  /**
   * Guia de tallas de una categoria: las medidas que cubre cada talla. Es la
   * tabla contra la que el probador virtual recomienda un talle.
   */
  async guiaDeTallas(categoriaId: number) {
    const filas = await this.prisma.guia_talla.findMany({
      where: { categoria_id: categoriaId },
      include: { talla: { select: { nombre: true, orden: true } } },
      orderBy: { talla: { orden: 'asc' } },
    })

    return filas.map((g) => ({
      talla_id: g.talla_id,
      talla: g.talla.nombre,
      busto_min: aNumero(g.busto_min),
      busto_max: aNumero(g.busto_max),
      cintura_min: aNumero(g.cintura_min),
      cintura_max: aNumero(g.cintura_max),
      cadera_min: aNumero(g.cadera_min),
      cadera_max: aNumero(g.cadera_max),
      altura_min: aNumero(g.altura_min),
      altura_max: aNumero(g.altura_max),
    }))
  }

  // ==========================================================================
  // Comprobaciones
  // ==========================================================================

  private async verificarCodigoLibre(codigo: string): Promise<void> {
    const existe = await this.prisma.producto.findUnique({
      where: { codigo },
      select: { id: true },
    })
    if (existe) throw ExcepcionNegocio.validacion({ codigo: 'Ya hay un producto con ese codigo' })
  }

  private async verificarSkusLibres(skus: string[]): Promise<void> {
    const ocupados = await this.prisma.variante.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
    })
    if (ocupados.length > 0) {
      throw ExcepcionNegocio.validacion({
        sku: `Estos SKU ya estan en uso: ${ocupados.map((o) => o.sku).join(', ')}`,
      })
    }
  }

  /**
   * Se comprueban talla y color antes de abrir la transaccion. Si se dejara
   * fallar a la clave ajena, el cliente recibiria "el registro referenciado no
   * existe" sin saber cual de los dos esta mal.
   */
  private async verificarTallasYColores(
    variantes: readonly { talla_id: number; color_id: number }[]
  ): Promise<void> {
    const tallas = [...new Set(variantes.map((v) => v.talla_id))]
    const colores = [...new Set(variantes.map((v) => v.color_id))]

    const [hayTallas, hayColores] = await Promise.all([
      this.prisma.talla.count({ where: { id: { in: tallas } } }),
      this.prisma.color.count({ where: { id: { in: colores } } }),
    ])

    const errores: Record<string, string> = {}
    if (hayTallas !== tallas.length) errores.talla_id = 'Alguna talla no existe'
    if (hayColores !== colores.length) errores.color_id = 'Algun color no existe'
    if (Object.keys(errores).length > 0) throw ExcepcionNegocio.validacion(errores)
  }

  private async slugLibre(nombre: string): Promise<string> {
    const base = aSlug(nombre)
    const parecidos = await this.prisma.producto.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    })
    return slugUnico(
      base,
      parecidos.map((p) => p.slug)
    )
  }
}
