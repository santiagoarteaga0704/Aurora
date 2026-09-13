<?php
declare(strict_types=1);

namespace Core;

/**
 * Base de los controladores: solo utilidades compartidas. La logica de negocio
 * vive en los servicios de cada modulo, no aqui.
 */
abstract class Controller
{
    /**
     * Valida el cuerpo de la peticion contra un conjunto de reglas.
     *
     * @param array<string,string> $reglas
     * @return array<string,mixed>
     */
    protected function validar(Request $req, array $reglas): array
    {
        return Validator::validar($req->cuerpo(), $reglas);
    }

    /**
     * Busca un registro por id o corta con 404.
     *
     * @return array<string,mixed>
     */
    protected function buscarOFallar(string $tabla, int $id, string $recurso = 'Registro'): array
    {
        $fila = DB::first("SELECT * FROM `{$tabla}` WHERE id = ? LIMIT 1", [$id]);
        if ($fila === null) {
            throw HttpException::noEncontrado($recurso);
        }
        return $fila;
    }
}
