<?php
declare(strict_types=1);

namespace Modules\Auth;

use Core\Auth;
use Core\Bitacora;
use Core\Controller;
use Core\DB;
use Core\HttpException;
use Core\Request;
use Core\Response;
use Core\Validator;

/**
 * Registro, inicio de sesion y manejo de tokens.
 *
 * Esquema de tokens:
 *   - acceso  : JWT de 1 hora, viaja en Authorization: Bearer
 *   - refresh : cadena opaca de 30 dias guardada hasheada en la tabla `sesion`
 * La app movil y el PWA guardan el refresh para poder reabrir sesion sin pedir
 * la contrasenia otra vez, lo que importa cuando el dispositivo estuvo offline.
 */
final class AuthController extends Controller
{
    private const MAX_INTENTOS = 5;
    private const MINUTOS_BLOQUEO = 15;

    /** POST /api/auth/registro  -  alta de un cliente desde la tienda */
    public function registro(Request $req): void
    {
        $datos = $this->validar($req, [
            'nombre'    => 'requerido|texto|min:2|max:80',
            'apellido'  => 'requerido|texto|min:2|max:80',
            'email'     => 'requerido|email|unico:usuario,email',
            'telefono'  => 'texto|max:30',
            'password'  => 'requerido|texto|min:8|max:72',
            'tipo'      => 'texto|en:minorista,mayorista',
            'nit'       => 'texto|max:20',
            'razon_social' => 'texto|max:150',
        ]);

        $tipo = $datos['tipo'] ?? 'minorista';
        if ($tipo === 'mayorista' && empty($datos['nit'])) {
            throw HttpException::validacion(['nit' => 'El NIT es obligatorio para cuentas mayoristas']);
        }

        $rolClienteId = DB::value("SELECT id FROM rol WHERE nombre = 'cliente' LIMIT 1");
        if ($rolClienteId === null) {
            throw new HttpException(500, 'El rol cliente no existe. Ejecuta el seed de la base de datos');
        }

        $usuarioId = DB::transaction(static function () use ($datos, $tipo, $rolClienteId): int {
            $id = DB::insert('usuario', [
                'rol_id'        => (int) $rolClienteId,
                'nombre'        => $datos['nombre'],
                'apellido'      => $datos['apellido'],
                'email'         => $datos['email'],
                'telefono'      => $datos['telefono'] ?? null,
                'password_hash' => Auth::hashPassword($datos['password']),
            ]);

            DB::insert('cliente', [
                'usuario_id'   => $id,
                'tipo'         => $tipo,
                'nit'          => $datos['nit'] ?? null,
                'razon_social' => $datos['razon_social'] ?? null,
                // un mayorista queda pendiente de aprobacion manual antes de
                // poder comprar con precios de mayoreo
                'mayorista_aprobado' => 0,
            ]);

            return $id;
        });

        Bitacora::registrar($req, 'crear', 'auth', 'usuario', $usuarioId, "Registro de cliente {$datos['email']}");

        Response::creado(
            $this->emitirTokens($usuarioId, $req),
            $tipo === 'mayorista'
                ? 'Cuenta creada. Un asesor validara tu NIT para habilitar los precios de mayoreo.'
                : 'Cuenta creada correctamente'
        );
    }

    /** POST /api/auth/login */
    public function login(Request $req): void
    {
        $datos = $this->validar($req, [
            'email'    => 'requerido|email',
            'password' => 'requerido|texto',
        ]);

        $usuario = DB::first(
            'SELECT id, password_hash, activo, intentos_fallidos, bloqueado_hasta
             FROM usuario WHERE email = ? LIMIT 1',
            [$datos['email']]
        );

        // Mensaje unico para usuario inexistente y contrasenia incorrecta:
        // asi no se revela que correos estan registrados.
        $credencialesInvalidas = new HttpException(401, 'Correo o contrasenia incorrectos');

        if ($usuario === null) {
            throw $credencialesInvalidas;
        }

        if ($usuario['bloqueado_hasta'] !== null && strtotime((string) $usuario['bloqueado_hasta']) > time()) {
            throw new HttpException(429, 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta mas tarde.');
        }

        if (!Auth::verificarPassword($datos['password'], (string) $usuario['password_hash'])) {
            $this->registrarIntentoFallido($usuario);
            Bitacora::registrar($req, 'login_fallido', 'auth', 'usuario', $usuario['id'], $datos['email']);
            throw $credencialesInvalidas;
        }

        if ((int) $usuario['activo'] !== 1) {
            throw HttpException::sinPermiso('Tu cuenta esta desactivada. Contacta con administracion.');
        }

        DB::update('usuario', [
            'intentos_fallidos' => 0,
            'bloqueado_hasta'   => null,
            'ultimo_acceso'     => date('Y-m-d H:i:s'),
        ], 'id = :id', ['id' => $usuario['id']]);

        Bitacora::registrar($req, 'login', 'auth', 'usuario', $usuario['id'], 'Inicio de sesion');

        Response::ok($this->emitirTokens((int) $usuario['id'], $req), 'Sesion iniciada');
    }

    /** POST /api/auth/refresh  -  renueva el token de acceso sin pedir contrasenia */
    public function refrescar(Request $req): void
    {
        $datos = Validator::validar($req->cuerpo(), ['refresh_token' => 'requerido|texto']);

        $sesion = Auth::sesionPorRefresh($datos['refresh_token']);
        if ($sesion === null) {
            throw HttpException::noAutenticado('La sesion expiro. Vuelve a iniciar sesion.');
        }

        // Rotacion: el refresh usado se revoca y se emite uno nuevo. Si alguien
        // roba un refresh y la victima lo usa despues, el robado deja de servir.
        Auth::revocarRefresh($datos['refresh_token']);

        Response::ok($this->emitirTokens((int) $sesion['usuario_id'], $req, (int) ($sesion['dispositivo_id'] ?? 0) ?: null));
    }

    /** POST /api/auth/logout */
    public function logout(Request $req): void
    {
        $refresh = $req->input('refresh_token');
        if (is_string($refresh) && $refresh !== '') {
            Auth::revocarRefresh($refresh);
        }
        Bitacora::registrar($req, 'logout', 'auth', 'usuario', $req->usuarioId(), 'Cierre de sesion');
        Response::ok(null, 'Sesion cerrada');
    }

    /** GET /api/auth/yo  -  perfil + permisos, lo consume el menu del front */
    public function yo(Request $req): void
    {
        $usuario = Auth::requerir($req);

        $perfil = DB::first(
            'SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.avatar_url,
                    u.sucursal_id, s.nombre AS sucursal, r.id AS rol_id, r.nombre AS rol,
                    c.tipo AS tipo_cliente, c.mayorista_aprobado, c.puntos
             FROM usuario u
             JOIN rol r ON r.id = u.rol_id
             LEFT JOIN sucursal s ON s.id = u.sucursal_id
             LEFT JOIN cliente c ON c.usuario_id = u.id
             WHERE u.id = ?',
            [$usuario['id']]
        );

        $perfil['permisos'] = $usuario['permisos'];
        Response::ok($perfil);
    }

    /** PUT /api/auth/password */
    public function cambiarPassword(Request $req): void
    {
        $usuario = Auth::requerir($req);
        $datos = $this->validar($req, [
            'password_actual' => 'requerido|texto',
            'password_nueva'  => 'requerido|texto|min:8|max:72',
        ]);

        $hash = (string) DB::value('SELECT password_hash FROM usuario WHERE id = ?', [$usuario['id']]);
        if (!Auth::verificarPassword($datos['password_actual'], $hash)) {
            throw HttpException::validacion(['password_actual' => 'La contrasenia actual no coincide']);
        }

        DB::update('usuario', [
            'password_hash' => Auth::hashPassword($datos['password_nueva']),
        ], 'id = :id', ['id' => $usuario['id']]);

        // cambiar la contrasenia cierra las demas sesiones abiertas
        DB::update('sesion', ['revocado' => 1], 'usuario_id = :u', ['u' => $usuario['id']]);

        Bitacora::registrar($req, 'actualizar', 'auth', 'usuario', $usuario['id'], 'Cambio de contrasenia');
        Response::ok(null, 'Contrasenia actualizada. Vuelve a iniciar sesion en tus otros dispositivos.');
    }

    /** @param array<string,mixed> $usuario */
    private function registrarIntentoFallido(array $usuario): void
    {
        $intentos = (int) $usuario['intentos_fallidos'] + 1;
        $datos = ['intentos_fallidos' => $intentos];

        if ($intentos >= self::MAX_INTENTOS) {
            $datos['bloqueado_hasta'] = date('Y-m-d H:i:s', time() + self::MINUTOS_BLOQUEO * 60);
            $datos['intentos_fallidos'] = 0;
        }

        DB::update('usuario', $datos, 'id = :id', ['id' => $usuario['id']]);
    }

    /**
     * Emite el par acceso/refresh y, si la peticion trae el encabezado
     * X-Dispositivo, deja el refresh atado a ese dispositivo para la sync.
     *
     * @return array<string,mixed>
     */
    private function emitirTokens(int $usuarioId, Request $req, ?int $dispositivoId = null): array
    {
        $usuario = DB::first(
            'SELECT u.id, u.nombre, u.apellido, u.email, u.sucursal_id, u.rol_id, r.nombre AS rol
             FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = ?',
            [$usuarioId]
        );

        $dispositivoId ??= $this->resolverDispositivo($req, $usuarioId);
        $refresh = Auth::crearRefresh($usuarioId, $req, $dispositivoId);

        return [
            'token'         => Auth::tokenAcceso($usuario),
            'expira_en'     => Auth::duracionAcceso(),
            'refresh_token' => $refresh['token'],
            'usuario'       => [
                'id'          => (int) $usuario['id'],
                'nombre'      => $usuario['nombre'],
                'apellido'    => $usuario['apellido'],
                'email'       => $usuario['email'],
                'rol'         => $usuario['rol'],
                'sucursal_id' => $usuario['sucursal_id'] === null ? null : (int) $usuario['sucursal_id'],
                'permisos'    => Auth::permisosDeRol((int) $usuario['rol_id']),
            ],
        ];
    }

    /**
     * Registra (o reutiliza) el dispositivo que envia el encabezado
     * X-Dispositivo. Es la clave para que la cola offline sepa de donde viene
     * cada operacion.
     */
    private function resolverDispositivo(Request $req, int $usuarioId): ?int
    {
        $uuid = $req->cabecera('x-dispositivo');
        if ($uuid === null || $uuid === '') {
            return null;
        }
        $uuid = substr($uuid, 0, 64);

        $existente = DB::first('SELECT id FROM dispositivo WHERE uuid = ? LIMIT 1', [$uuid]);
        if ($existente !== null) {
            DB::update('dispositivo', ['usuario_id' => $usuarioId], 'id = :id', ['id' => $existente['id']]);
            return (int) $existente['id'];
        }

        $agente = strtolower($req->userAgent());
        $plataforma = str_contains($agente, 'android') ? 'android'
            : (str_contains($agente, 'iphone') || str_contains($agente, 'ipad') ? 'ios' : 'web');

        return DB::insert('dispositivo', [
            'usuario_id' => $usuarioId,
            'uuid'       => $uuid,
            'plataforma' => $plataforma,
            'modelo'     => substr($req->userAgent(), 0, 80),
        ]);
    }
}
