<?php
declare(strict_types=1);

namespace Core;

/**
 * Enrutador propio. Traduce patrones como /api/productos/{id} a expresiones
 * regulares y ejecuta la cadena de middlewares declarada en cada ruta.
 */
final class Router
{
    /** @var array<string, list<array{regex:string, params:list<string>, handler:callable|array, middlewares:list<string>}>> */
    private array $rutas = [];

    public function get(string $patron, callable|array $handler, array $middlewares = []): void
    {
        $this->registrar('GET', $patron, $handler, $middlewares);
    }

    public function post(string $patron, callable|array $handler, array $middlewares = []): void
    {
        $this->registrar('POST', $patron, $handler, $middlewares);
    }

    public function put(string $patron, callable|array $handler, array $middlewares = []): void
    {
        $this->registrar('PUT', $patron, $handler, $middlewares);
    }

    public function patch(string $patron, callable|array $handler, array $middlewares = []): void
    {
        $this->registrar('PATCH', $patron, $handler, $middlewares);
    }

    public function delete(string $patron, callable|array $handler, array $middlewares = []): void
    {
        $this->registrar('DELETE', $patron, $handler, $middlewares);
    }

    /**
     * Agrupa rutas bajo un prefijo y una lista de middlewares comunes.
     * Evita repetir ['auth'] en cada linea del modulo de administracion.
     */
    public function grupo(string $prefijo, array $middlewares, callable $definir): void
    {
        $grupo = new self();
        $definir($grupo);
        foreach ($grupo->rutas as $metodo => $rutas) {
            foreach ($rutas as $ruta) {
                $this->registrar(
                    $metodo,
                    $prefijo . $ruta['patron'],
                    $ruta['handler'],
                    array_merge($middlewares, $ruta['middlewares'])
                );
            }
        }
    }

    private function registrar(string $metodo, string $patron, callable|array $handler, array $middlewares): void
    {
        [$regex, $params] = $this->compilar($patron);
        $this->rutas[$metodo][] = [
            'regex'       => $regex,
            'params'      => $params,
            'patron'      => $patron,
            'handler'     => $handler,
            'middlewares' => $middlewares,
        ];
    }

    /**
     * /api/pedidos/{id}/pagos  ->  #^/api/pedidos/([^/]+)/pagos$#
     *
     * @return array{0:string, 1:list<string>}
     */
    private function compilar(string $patron): array
    {
        $params = [];
        $regex = preg_replace_callback(
            '/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/',
            static function (array $m) use (&$params): string {
                $params[] = $m[1];
                return '([^/]+)';
            },
            $patron
        );
        return ['#^' . $regex . '$#', $params];
    }

    public function despachar(Request $req): void
    {
        $candidatas = $this->rutas[$req->metodo] ?? [];

        foreach ($candidatas as $ruta) {
            if (preg_match($ruta['regex'], $req->ruta, $coincidencias) !== 1) {
                continue;
            }
            array_shift($coincidencias);
            $req->setParams(array_combine($ruta['params'], $coincidencias) ?: []);

            foreach ($ruta['middlewares'] as $middleware) {
                Middleware::ejecutar($middleware, $req);
            }

            $handler = $ruta['handler'];
            if (is_array($handler)) {
                [$clase, $metodo] = $handler;
                (new $clase())->{$metodo}($req);
            } else {
                $handler($req);
            }
            return;
        }

        // la ruta existe pero con otro verbo: se responde 405, no 404
        foreach ($this->rutas as $metodo => $rutas) {
            if ($metodo === $req->metodo) {
                continue;
            }
            foreach ($rutas as $ruta) {
                if (preg_match($ruta['regex'], $req->ruta) === 1) {
                    throw new HttpException(405, "El metodo {$req->metodo} no esta permitido en esta ruta");
                }
            }
        }

        throw new HttpException(404, "Ruta no encontrada: {$req->metodo} {$req->ruta}");
    }
}
