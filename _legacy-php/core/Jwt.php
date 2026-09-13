<?php
declare(strict_types=1);

namespace Core;

/**
 * Implementacion propia de JWT con HS256. No se usa ninguna libreria: firma y
 * verificacion con hash_hmac, comparacion en tiempo constante.
 */
final class Jwt
{
    private const ALG = 'HS256';

    /** @param array<string,mixed> $carga */
    public static function firmar(array $carga, int $duracionSegundos): string
    {
        $ahora = time();
        $carga['iat'] = $ahora;
        $carga['exp'] = $ahora + $duracionSegundos;
        $carga['jti'] = bin2hex(random_bytes(8));

        $cabecera = self::b64(json_encode(['alg' => self::ALG, 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $cuerpo   = self::b64(json_encode($carga, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        $firma    = self::b64(self::hmac("{$cabecera}.{$cuerpo}"));

        return "{$cabecera}.{$cuerpo}.{$firma}";
    }

    /**
     * Devuelve la carga del token o null si la firma no coincide, el formato es
     * invalido o ya expiro.
     *
     * @return array<string,mixed>|null
     */
    public static function verificar(string $token): ?array
    {
        $partes = explode('.', $token);
        if (count($partes) !== 3) {
            return null;
        }
        [$cabecera64, $cuerpo64, $firma64] = $partes;

        $esperada = self::b64(self::hmac("{$cabecera64}.{$cuerpo64}"));
        if (!hash_equals($esperada, $firma64)) {
            return null;
        }

        $cabecera = json_decode(self::deB64($cabecera64), true);
        if (!is_array($cabecera) || ($cabecera['alg'] ?? '') !== self::ALG) {
            return null; // bloquea el ataque de alg=none
        }

        $carga = json_decode(self::deB64($cuerpo64), true);
        if (!is_array($carga)) {
            return null;
        }
        if (!isset($carga['exp']) || time() >= (int) $carga['exp']) {
            return null;
        }

        return $carga;
    }

    private static function hmac(string $mensaje): string
    {
        return hash_hmac('sha256', $mensaje, Env::requerido('JWT_SECRET'), true);
    }

    private static function b64(string $datos): string
    {
        return rtrim(strtr(base64_encode($datos), '+/', '-_'), '=');
    }

    private static function deB64(string $datos): string
    {
        $relleno = strlen($datos) % 4;
        if ($relleno !== 0) {
            $datos .= str_repeat('=', 4 - $relleno);
        }
        return base64_decode(strtr($datos, '-_', '+/'), true) ?: '';
    }
}
