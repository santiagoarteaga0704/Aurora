<?php
declare(strict_types=1);

namespace Core;

/**
 * Representa la peticion HTTP entrante ya normalizada: metodo, ruta, cuerpo
 * JSON, query string y cabeceras.
 */
final class Request
{
    public readonly string $metodo;
    public readonly string $ruta;
    /** @var array<string,mixed> */
    public readonly array $query;
    /** @var array<string,mixed> */
    private array $cuerpo;
    /** @var array<string,string> */
    private array $cabeceras;
    /** @var array<string,string> Parametros de la ruta: /productos/{id} */
    private array $params = [];

    private ?array $usuario = null;

    public function __construct()
    {
        $this->metodo = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // permite montar la API en un subdirectorio (hosting compartido)
        $base = rtrim(Env::get('API_BASE_PATH', '') ?? '', '/');
        if ($base !== '' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }
        $this->ruta = '/' . trim($uri, '/');

        $this->query = $_GET;
        $this->cabeceras = $this->leerCabeceras();
        $this->cuerpo = $this->leerCuerpo();
    }

    /** @return array<string,string> */
    private function leerCabeceras(): array
    {
        $cabeceras = [];
        foreach ($_SERVER as $clave => $valor) {
            if (str_starts_with($clave, 'HTTP_')) {
                $nombre = strtolower(str_replace('_', '-', substr($clave, 5)));
                $cabeceras[$nombre] = (string) $valor;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $cabeceras['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }
        return $cabeceras;
    }

    /** @return array<string,mixed> */
    private function leerCuerpo(): array
    {
        $tipo = $this->cabecera('content-type') ?? '';

        if (str_contains($tipo, 'application/json')) {
            $crudo = file_get_contents('php://input') ?: '';
            if ($crudo === '') {
                return [];
            }
            $datos = json_decode($crudo, true);
            if (!is_array($datos)) {
                throw new HttpException(400, 'El cuerpo de la peticion no es JSON valido');
            }
            return $datos;
        }

        // multipart/form-data (subida de imagenes) y form-urlencoded
        return $_POST;
    }

    public function cabecera(string $nombre): ?string
    {
        return $this->cabeceras[strtolower($nombre)] ?? null;
    }

    public function bearer(): ?string
    {
        $auth = $this->cabecera('authorization');
        if ($auth !== null && preg_match('/^Bearer\s+(.+)$/i', $auth, $m) === 1) {
            return trim($m[1]);
        }
        return null;
    }

    public function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function userAgent(): string
    {
        return substr((string) ($this->cabecera('user-agent') ?? ''), 0, 255);
    }

    /** Clave de idempotencia usada por la sincronizacion offline. */
    public function idempotencyKey(): ?string
    {
        return $this->cabecera('idempotency-key') ?? ($this->cuerpo['idempotency_key'] ?? null);
    }

    /** @param array<string,string> $params */
    public function setParams(array $params): void
    {
        $this->params = $params;
    }

    public function param(string $nombre, ?string $porDefecto = null): ?string
    {
        return $this->params[$nombre] ?? $porDefecto;
    }

    public function paramInt(string $nombre): int
    {
        $valor = $this->param($nombre);
        if ($valor === null || !ctype_digit($valor)) {
            throw new HttpException(400, "El parametro de ruta '{$nombre}' debe ser un entero");
        }
        return (int) $valor;
    }

    /** @return array<string,mixed> */
    public function cuerpo(): array
    {
        return $this->cuerpo;
    }

    public function input(string $clave, mixed $porDefecto = null): mixed
    {
        return $this->cuerpo[$clave] ?? $this->query[$clave] ?? $porDefecto;
    }

    public function q(string $clave, ?string $porDefecto = null): ?string
    {
        $valor = $this->query[$clave] ?? $porDefecto;
        return $valor === null ? null : (string) $valor;
    }

    public function qInt(string $clave, int $porDefecto): int
    {
        $valor = $this->query[$clave] ?? null;
        return is_numeric($valor) ? (int) $valor : $porDefecto;
    }

    /** Pagina y tamanio de pagina normalizados, con tope para no reventar la BD. */
    public function paginacion(int $porPaginaDefecto = 20, int $maximo = 100): array
    {
        $pagina = max(1, $this->qInt('pagina', 1));
        $porPagina = min($maximo, max(1, $this->qInt('por_pagina', $porPaginaDefecto)));
        return [$pagina, $porPagina, ($pagina - 1) * $porPagina];
    }

    /** @param array<string,mixed>|null $usuario */
    public function setUsuario(?array $usuario): void
    {
        $this->usuario = $usuario;
    }

    /** @return array<string,mixed>|null */
    public function usuario(): ?array
    {
        return $this->usuario;
    }

    public function usuarioId(): ?int
    {
        return isset($this->usuario['id']) ? (int) $this->usuario['id'] : null;
    }
}
