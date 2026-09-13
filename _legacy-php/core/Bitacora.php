<?php
declare(strict_types=1);

namespace Core;

/**
 * Bitacora de auditoria. Registra quien hizo que, sobre que entidad y con que
 * valores antes y despues. Nunca debe interrumpir la operacion de negocio: si
 * el registro falla, se traga el error y se sigue.
 */
final class Bitacora
{
    public static function registrar(
        ?Request $req,
        string $accion,
        string $modulo,
        ?string $entidad = null,
        int|string|null $entidadId = null,
        ?string $descripcion = null,
        ?array $datosPrevios = null,
        ?array $datosNuevos = null
    ): void {
        try {
            DB::insert('bitacora', [
                'usuario_id'    => $req?->usuarioId(),
                'accion'        => $accion,
                'modulo'        => $modulo,
                'entidad'       => $entidad,
                'entidad_id'    => $entidadId === null ? null : (string) $entidadId,
                'descripcion'   => $descripcion === null ? null : mb_substr($descripcion, 0, 255),
                'datos_previos' => $datosPrevios === null ? null : self::aJson($datosPrevios),
                'datos_nuevos'  => $datosNuevos === null ? null : self::aJson($datosNuevos),
                'ip'            => $req?->ip(),
                'user_agent'    => $req?->userAgent(),
            ]);
        } catch (\Throwable $e) {
            error_log('Bitacora fallo: ' . $e->getMessage());
        }
    }

    /**
     * Serializa a JSON ocultando campos sensibles para que la bitacora nunca
     * guarde contrasenias ni tokens.
     */
    private static function aJson(array $datos): string
    {
        $ocultar = ['password', 'password_hash', 'token', 'refresh_token', 'qr_payload'];
        foreach ($ocultar as $campo) {
            if (array_key_exists($campo, $datos)) {
                $datos[$campo] = '***';
            }
        }
        return json_encode($datos, JSON_UNESCAPED_UNICODE) ?: '{}';
    }
}
