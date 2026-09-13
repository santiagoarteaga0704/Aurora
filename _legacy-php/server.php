<?php
/**
 * Router para el servidor embebido de PHP (solo desarrollo).
 *
 *   php -S localhost:8000 backend/server.php
 *
 * En produccion esto no se usa: Apache aplica public/.htaccess y manda todo
 * a public/index.php.
 */
$ruta = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$archivo = __DIR__ . '/public' . $ruta;

// deja que el servidor sirva archivos reales (imagenes subidas, etc.)
if ($ruta !== '/' && is_file($archivo)) {
    return false;
}

require __DIR__ . '/public/index.php';
