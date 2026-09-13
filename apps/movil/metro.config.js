/**
 * Metro en un monorepo.
 *
 * Desde el SDK 54, `expo/metro-config` ya detecta el workspace y resuelve el
 * `node_modules` de la raiz por su cuenta. Lo unico que hay que agregarle es que
 * VIGILE la raiz, para que un cambio en `packages/contratos` recargue la app sin
 * reiniciar el empaquetador.
 *
 * Aca hubo antes un `disableHierarchicalLookup` y una lista de
 * `nodeModulesPaths` a mano. Servian para forzar que no hubiera dos copias de
 * React, pero eso era tapar el problema en el empaquetador en vez de
 * arreglarlo: la duplicacion se resolvio en el `package.json` de la raiz, con
 * un override que deja una sola version en todo el arbol. Con eso, la
 * configuracion por defecto alcanza —y `expo-doctor` deja de advertir que se
 * esta peleando con ella—.
 */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const proyecto = __dirname
const raiz = path.resolve(proyecto, '../..')

const config = getDefaultConfig(proyecto)

config.watchFolders = [raiz]

module.exports = config
