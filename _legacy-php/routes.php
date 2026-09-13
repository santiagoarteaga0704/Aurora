<?php
declare(strict_types=1);

/**
 * Tabla de rutas de la API. Un solo lugar donde se ve todo el contrato HTTP:
 * el PWA y la app Flutter consumen exactamente estos endpoints.
 *
 * Middlewares disponibles: auth | opcional | permiso:codigo | limite:n,seg
 */

use Core\DB;
use Core\Request;
use Core\Response;
use Core\Router;
use Modules\Auth\AuthController;

return static function (Router $r): void {

    // -----------------------------------------------------------------------
    // Salud del servicio: lo usa el PWA para decidir si esta online.
    // -----------------------------------------------------------------------
    $r->get('/api/salud', static function (Request $req): void {
        $bd = true;
        try {
            DB::value('SELECT 1');
        } catch (\Throwable) {
            $bd = false;
        }
        Response::ok([
            'servicio'  => 'aurora-api',
            'version'   => '0.1.0',
            'bd'        => $bd,
            'hora'      => date('c'),
        ]);
    });

    // -----------------------------------------------------------------------
    // Autenticacion
    // -----------------------------------------------------------------------
    $r->grupo('/api/auth', [], static function (Router $g): void {
        // limite estricto en login y registro para frenar fuerza bruta
        $g->post('/registro', [AuthController::class, 'registro'], ['limite:10,600']);
        $g->post('/login',    [AuthController::class, 'login'],    ['limite:10,600']);
        $g->post('/refresh',  [AuthController::class, 'refrescar']);
        $g->post('/logout',   [AuthController::class, 'logout'],   ['opcional']);
        $g->get('/yo',        [AuthController::class, 'yo'],       ['auth']);
        $g->put('/password',  [AuthController::class, 'cambiarPassword'], ['auth']);
    });

    // -----------------------------------------------------------------------
    // Los demas modulos se registran aqui a medida que se implementan:
    //   catalogo, inventario, ventas, pagos, probador, ia, reportes, sync
    // -----------------------------------------------------------------------
};
