<?php
declare(strict_types=1);

namespace Core;

/**
 * Autenticacion por JWT y autorizacion por permisos de rol (RBAC).
 * Los permisos viven en la base, no en el codigo: un administrador puede crear
 * un rol nuevo y asignarle permisos sin tocar el backend.
 */
final class Auth
{
    private const DURACION_ACCESO  = 3600;          // 1 hora
    private const DURACION_REFRESH = 60 * 60 * 24 * 30; // 30 dias

    /** @var array<int, list<string>> cache de permisos por rol dentro de la peticion */
    private static array $cachePermisos = [];

    /**
     * Lee el token del encabezado y devuelve el usuario, o null si no hay token
     * valido. No lanza excepcion: sirve para rutas que funcionan con o sin
     * sesion (ej. el catalogo).
     *
     * @return array<string,mixed>|null
     */
    public static function usuarioDe(Request $req): ?array
    {
        $token = $req->bearer();
        if ($token === null) {
            return null;
        }

        $carga = Jwt::verificar($token);
        if ($carga === null || ($carga['tipo'] ?? '') !== 'acceso') {
            return null;
        }

        $usuario = DB::first(
            'SELECT u.id, u.nombre, u.apellido, u.email, u.rol_id, u.sucursal_id, u.activo,
                    r.nombre AS rol
             FROM usuario u
             JOIN rol r ON r.id = u.rol_id
             WHERE u.id = ? LIMIT 1',
            [(int) ($carga['sub'] ?? 0)]
        );

        if ($usuario === null || (int) $usuario['activo'] !== 1) {
            return null;
        }

        $usuario['permisos'] = self::permisosDeRol((int) $usuario['rol_id']);
        return $usuario;
    }

    /** @return array<string,mixed> */
    public static function requerir(Request $req): array
    {
        $usuario = $req->usuario() ?? self::usuarioDe($req);
        if ($usuario === null) {
            throw HttpException::noAutenticado();
        }
        $req->setUsuario($usuario);
        return $usuario;
    }

    /** @return list<string> */
    public static function permisosDeRol(int $rolId): array
    {
        if (isset(self::$cachePermisos[$rolId])) {
            return self::$cachePermisos[$rolId];
        }
        $filas = DB::all(
            'SELECT p.codigo FROM rol_permiso rp
             JOIN permiso p ON p.id = rp.permiso_id
             WHERE rp.rol_id = ?',
            [$rolId]
        );
        return self::$cachePermisos[$rolId] = array_column($filas, 'codigo');
    }

    /** @param array<string,mixed> $usuario */
    public static function puede(array $usuario, string $permiso): bool
    {
        $permisos = $usuario['permisos'] ?? [];
        // el comodin '*' se le da al rol administrador
        return in_array('*', $permisos, true) || in_array($permiso, $permisos, true);
    }

    public static function requerirPermiso(Request $req, string $permiso): void
    {
        $usuario = self::requerir($req);
        if (!self::puede($usuario, $permiso)) {
            throw HttpException::sinPermiso("Te falta el permiso '{$permiso}'");
        }
    }

    /**
     * Un gerente o vendedor solo puede ver datos de su propia sucursal.
     * El administrador (permiso *) no tiene esa restriccion.
     *
     * @param array<string,mixed> $usuario
     */
    public static function restringeSucursal(array $usuario): ?int
    {
        if (self::puede($usuario, '*') || self::puede($usuario, 'sucursal.ver_todas')) {
            return null;
        }
        return $usuario['sucursal_id'] === null ? null : (int) $usuario['sucursal_id'];
    }

    public static function hashPassword(string $plano): string
    {
        return password_hash($plano, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verificarPassword(string $plano, string $hash): bool
    {
        return password_verify($plano, $hash);
    }

    /** @param array<string,mixed> $usuario */
    public static function tokenAcceso(array $usuario): string
    {
        return Jwt::firmar([
            'sub'         => (int) $usuario['id'],
            'tipo'        => 'acceso',
            'rol'         => $usuario['rol'] ?? null,
            'sucursal_id' => $usuario['sucursal_id'] ?? null,
        ], self::DURACION_ACCESO);
    }

    public static function duracionAcceso(): int
    {
        return self::DURACION_ACCESO;
    }

    /**
     * Emite un refresh token opaco y guarda solo su hash. Si alguien lee la
     * tabla `sesion` no puede reusar los tokens.
     *
     * @return array{token:string, expira:string}
     */
    public static function crearRefresh(int $usuarioId, Request $req, ?int $dispositivoId = null): array
    {
        $token = bin2hex(random_bytes(32));
        $expira = date('Y-m-d H:i:s', time() + self::DURACION_REFRESH);

        DB::insert('sesion', [
            'usuario_id'     => $usuarioId,
            'dispositivo_id' => $dispositivoId,
            'token_hash'     => hash('sha256', $token),
            'ip'             => $req->ip(),
            'user_agent'     => $req->userAgent(),
            'expira_en'      => $expira,
        ]);

        return ['token' => $token, 'expira' => $expira];
    }

    /** @return array<string,mixed>|null */
    public static function sesionPorRefresh(string $token): ?array
    {
        return DB::first(
            'SELECT * FROM sesion
             WHERE token_hash = ? AND revocado = 0 AND expira_en > NOW()
             LIMIT 1',
            [hash('sha256', $token)]
        );
    }

    public static function revocarRefresh(string $token): void
    {
        DB::update('sesion', ['revocado' => 1], 'token_hash = :h', ['h' => hash('sha256', $token)]);
    }
}
