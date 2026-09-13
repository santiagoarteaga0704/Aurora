<?php
declare(strict_types=1);

namespace Core;

/**
 * Middlewares declarados como cadenas en la definicion de rutas:
 *   'auth'                  -> exige sesion valida
 *   'permiso:producto.crear'-> exige sesion + ese permiso
 *   'opcional'              -> carga el usuario si hay token, sin exigirlo
 *   'limite:30,60'          -> maximo 30 peticiones cada 60 segundos por IP
 */
final class Middleware
{
    public static function ejecutar(string $definicion, Request $req): void
    {
        [$nombre, $arg] = array_pad(explode(':', $definicion, 2), 2, null);

        switch ($nombre) {
            case 'auth':
                Auth::requerir($req);
                return;

            case 'opcional':
                $req->setUsuario(Auth::usuarioDe($req));
                return;

            case 'permiso':
                Auth::requerirPermiso($req, (string) $arg);
                return;

            case 'limite':
                [$maximo, $ventana] = array_pad(explode(',', (string) $arg), 2, '60');
                self::limitarTasa($req, (int) $maximo, (int) $ventana);
                return;

            default:
                throw new \LogicException("Middleware desconocido: {$nombre}");
        }
    }

    /**
     * Limitador de tasa por IP + ruta, en archivos temporales. Es suficiente
     * para proteger login y el endpoint de IA en un hosting compartido, donde
     * no hay Redis disponible.
     */
    private static function limitarTasa(Request $req, int $maximo, int $ventanaSeg): void
    {
        $dir = dirname(__DIR__) . '/storage/limites';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $clave = hash('sha256', $req->ip() . '|' . $req->ruta);
        $archivo = "{$dir}/{$clave}.json";
        $ahora = time();

        $registro = ['inicio' => $ahora, 'conteo' => 0];
        if (is_file($archivo)) {
            $guardado = json_decode((string) file_get_contents($archivo), true);
            if (is_array($guardado) && ($ahora - (int) $guardado['inicio']) < $ventanaSeg) {
                $registro = $guardado;
            }
        }

        $registro['conteo']++;
        file_put_contents($archivo, json_encode($registro), LOCK_EX);

        if ($registro['conteo'] > $maximo) {
            $espera = $ventanaSeg - ($ahora - (int) $registro['inicio']);
            throw new HttpException(429, "Demasiadas peticiones. Intenta de nuevo en {$espera} segundos");
        }
    }
}
