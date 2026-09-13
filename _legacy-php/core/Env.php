<?php
declare(strict_types=1);

namespace Core;

/**
 * Lector minimo de archivos .env. No usa librerias externas: recorre el archivo
 * linea por linea y deja los valores en un arreglo estatico.
 */
final class Env
{
    /** @var array<string,string> */
    private static array $vars = [];
    private static bool $cargado = false;

    public static function cargar(string $ruta): void
    {
        if (self::$cargado) {
            return;
        }
        self::$cargado = true;

        if (!is_readable($ruta)) {
            return; // en produccion las variables pueden venir del entorno
        }

        foreach (file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
            $linea = trim($linea);
            if ($linea === '' || $linea[0] === '#') {
                continue;
            }
            $partes = explode('=', $linea, 2);
            if (count($partes) !== 2) {
                continue;
            }
            $clave = trim($partes[0]);
            $valor = trim($partes[1]);
            // permite valores entrecomillados: CLAVE="algo con espacios"
            if (strlen($valor) >= 2
                && ($valor[0] === '"' || $valor[0] === "'")
                && $valor[strlen($valor) - 1] === $valor[0]) {
                $valor = substr($valor, 1, -1);
            }
            self::$vars[$clave] = $valor;
        }
    }

    public static function get(string $clave, ?string $porDefecto = null): ?string
    {
        if (array_key_exists($clave, self::$vars)) {
            return self::$vars[$clave];
        }
        $delSistema = getenv($clave);
        return $delSistema === false ? $porDefecto : $delSistema;
    }

    public static function requerido(string $clave): string
    {
        $valor = self::get($clave);
        if ($valor === null || $valor === '') {
            throw new \RuntimeException("Falta la variable de entorno {$clave}");
        }
        return $valor;
    }

    public static function bool(string $clave, bool $porDefecto = false): bool
    {
        $valor = self::get($clave);
        if ($valor === null) {
            return $porDefecto;
        }
        return in_array(strtolower($valor), ['1', 'true', 'on', 'yes'], true);
    }
}
