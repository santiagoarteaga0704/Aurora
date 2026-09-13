<?php
declare(strict_types=1);

/**
 * Punto de entrada unico de la API de AURORA.
 * Todo el trafico pasa por aqui (ver .htaccess): no hay un archivo PHP por
 * pantalla, sino un front controller que arma la peticion y la enruta.
 */

use Core\Bitacora;
use Core\Env;
use Core\HttpException;
use Core\Request;
use Core\Response;
use Core\Router;

define('RAIZ', dirname(__DIR__));

// ---------------------------------------------------------------------------
// Autocarga PSR-4 minima, sin Composer: Core\ -> core/, Modules\ -> modules/
// ---------------------------------------------------------------------------
spl_autoload_register(static function (string $clase): void {
    $prefijos = [
        'Core\\'    => RAIZ . '/core/',
        'Modules\\' => RAIZ . '/modules/',
    ];
    foreach ($prefijos as $prefijo => $directorio) {
        if (!str_starts_with($clase, $prefijo)) {
            continue;
        }
        $relativo = str_replace('\\', '/', substr($clase, strlen($prefijo)));
        $archivo = $directorio . $relativo . '.php';
        if (is_file($archivo)) {
            require_once $archivo;
            return;
        }
    }
});

Env::cargar(RAIZ . '/.env');

$depuracion = Env::bool('APP_DEBUG', false);
ini_set('display_errors', $depuracion ? '1' : '0');
error_reporting(E_ALL);
date_default_timezone_set('America/La_Paz');

// ---------------------------------------------------------------------------
// CORS: el PWA y la app Flutter viven en otro origen que la API.
// ---------------------------------------------------------------------------
$origenesPermitidos = array_map('trim', explode(',', Env::get('CORS_ORIGINS', '*') ?? '*'));
$origen = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array('*', $origenesPermitidos, true)) {
    header('Access-Control-Allow-Origin: *');
} elseif ($origen !== '' && in_array($origen, $origenesPermitidos, true)) {
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key, X-Dispositivo');
header('Access-Control-Max-Age: 86400');

// Cabeceras de seguridad basicas
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---------------------------------------------------------------------------
// Enrutado
// ---------------------------------------------------------------------------
try {
    $req = new Request();
    $router = new Router();
    (require RAIZ . '/routes.php')($router);
    $router->despachar($req);
} catch (HttpException $e) {
    Response::error($e->getMessage(), $e->getCode(), $e->errores);
} catch (PDOException $e) {
    error_log('[BD] ' . $e->getMessage());
    // 23000 = violacion de restriccion de integridad (unico / clave foranea)
    if ($e->getCode() === '23000') {
        Response::error('La operacion viola una restriccion de datos (duplicado o referencia inexistente)', 409);
    } else {
        Response::error(
            $depuracion ? $e->getMessage() : 'Error de base de datos',
            500
        );
    }
} catch (Throwable $e) {
    error_log('[ERROR] ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    Bitacora::registrar(
        $req ?? null,
        'error',
        'sistema',
        null,
        null,
        substr($e->getMessage(), 0, 200)
    );
    Response::error(
        $depuracion ? $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() : 'Error interno del servidor',
        500
    );
}
