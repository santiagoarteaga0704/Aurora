<?php
declare(strict_types=1);

namespace Core;

/**
 * Emisor de respuestas JSON. Todas las respuestas de la API comparten la misma
 * forma para que el PWA y Flutter puedan parsearlas con un solo modelo.
 */
final class Response
{
    /** @param array<string,mixed> $cabeceras */
    public static function json(mixed $datos, int $estado = 200, array $cabeceras = []): void
    {
        http_response_code($estado);
        header('Content-Type: application/json; charset=utf-8');
        foreach ($cabeceras as $nombre => $valor) {
            header("{$nombre}: {$valor}");
        }
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function ok(mixed $datos = null, ?string $mensaje = null): void
    {
        $carga = ['ok' => true];
        if ($mensaje !== null) {
            $carga['mensaje'] = $mensaje;
        }
        $carga['datos'] = $datos;
        self::json($carga);
    }

    public static function creado(mixed $datos, ?string $mensaje = null): void
    {
        self::json(['ok' => true, 'mensaje' => $mensaje, 'datos' => $datos], 201);
    }

    /**
     * @param list<array<string,mixed>> $items
     */
    public static function pagina(array $items, int $total, int $pagina, int $porPagina): void
    {
        self::json([
            'ok'    => true,
            'datos' => $items,
            'meta'  => [
                'total'      => $total,
                'pagina'     => $pagina,
                'por_pagina' => $porPagina,
                'paginas'    => $porPagina > 0 ? (int) ceil($total / $porPagina) : 0,
            ],
        ]);
    }

    /** @param array<string,string> $errores */
    public static function error(string $mensaje, int $estado = 400, array $errores = []): void
    {
        $carga = ['ok' => false, 'mensaje' => $mensaje];
        if ($errores !== []) {
            $carga['errores'] = $errores;
        }
        self::json($carga, $estado);
    }

    public static function sinContenido(): void
    {
        http_response_code(204);
    }
}
