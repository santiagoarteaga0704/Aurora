<?php
declare(strict_types=1);

namespace Core;

/**
 * Error controlado que el front controller traduce a una respuesta JSON con el
 * codigo HTTP correcto. Cualquier otra excepcion se reporta como 500.
 */
class HttpException extends \RuntimeException
{
    /** @var array<string,string> */
    public readonly array $errores;

    /** @param array<string,string> $errores */
    public function __construct(int $estado, string $mensaje, array $errores = [])
    {
        parent::__construct($mensaje, $estado);
        $this->errores = $errores;
    }

    public static function noAutenticado(string $mensaje = 'Necesitas iniciar sesion'): self
    {
        return new self(401, $mensaje);
    }

    public static function sinPermiso(string $mensaje = 'No tienes permiso para esta accion'): self
    {
        return new self(403, $mensaje);
    }

    public static function noEncontrado(string $recurso = 'Recurso'): self
    {
        return new self(404, "{$recurso} no encontrado");
    }

    public static function conflicto(string $mensaje): self
    {
        return new self(409, $mensaje);
    }

    /** @param array<string,string> $errores */
    public static function validacion(array $errores, string $mensaje = 'Datos invalidos'): self
    {
        return new self(422, $mensaje, $errores);
    }
}
