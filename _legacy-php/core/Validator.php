<?php
declare(strict_types=1);

namespace Core;

/**
 * Validador por reglas en cadena: 'requerido|entero|min:1'.
 * Acumula todos los errores y lanza una sola HttpException 422.
 */
final class Validator
{
    /** @var array<string,mixed> */
    private array $datos;
    /** @var array<string,string> */
    private array $errores = [];
    /** @var array<string,mixed> */
    private array $limpios = [];

    /** @param array<string,mixed> $datos */
    public function __construct(array $datos)
    {
        $this->datos = $datos;
    }

    /**
     * @param array<string,string> $reglas  campo => 'requerido|email'
     * @return array<string,mixed> solo los campos declarados, ya casteados
     */
    public static function validar(array $datos, array $reglas): array
    {
        $v = new self($datos);
        foreach ($reglas as $campo => $cadena) {
            $v->aplicar($campo, explode('|', $cadena));
        }
        if ($v->errores !== []) {
            throw HttpException::validacion($v->errores);
        }
        return $v->limpios;
    }

    /** @param list<string> $reglas */
    private function aplicar(string $campo, array $reglas): void
    {
        $valor = $this->datos[$campo] ?? null;
        $esRequerido = in_array('requerido', $reglas, true);

        if ($valor === null || $valor === '') {
            if ($esRequerido) {
                $this->errores[$campo] = 'Este campo es obligatorio';
            } elseif (array_key_exists($campo, $this->datos)) {
                // se envio explicitamente como nulo: se respeta
                $this->limpios[$campo] = null;
            }
            return;
        }

        foreach ($reglas as $regla) {
            [$nombre, $arg] = array_pad(explode(':', $regla, 2), 2, null);

            switch ($nombre) {
                case 'requerido':
                    break;

                case 'entero':
                    if (!is_int($valor) && !(is_string($valor) && preg_match('/^-?\d+$/', $valor) === 1)) {
                        $this->errores[$campo] = 'Debe ser un numero entero';
                        return;
                    }
                    $valor = (int) $valor;
                    break;

                case 'decimal':
                    if (!is_numeric($valor)) {
                        $this->errores[$campo] = 'Debe ser un numero';
                        return;
                    }
                    $valor = (float) $valor;
                    break;

                case 'booleano':
                    $valor = in_array($valor, [true, 1, '1', 'true', 'on'], true) ? 1 : 0;
                    break;

                case 'texto':
                    if (!is_string($valor)) {
                        $this->errores[$campo] = 'Debe ser texto';
                        return;
                    }
                    $valor = trim($valor);
                    break;

                case 'email':
                    if (!is_string($valor) || filter_var($valor, FILTER_VALIDATE_EMAIL) === false) {
                        $this->errores[$campo] = 'Correo electronico invalido';
                        return;
                    }
                    $valor = strtolower(trim($valor));
                    break;

                case 'fecha':
                    if (!is_string($valor) || strtotime($valor) === false) {
                        $this->errores[$campo] = 'Fecha invalida';
                        return;
                    }
                    break;

                case 'min':
                    if (is_numeric($valor) && (float) $valor < (float) $arg) {
                        $this->errores[$campo] = "El valor minimo es {$arg}";
                        return;
                    }
                    if (is_string($valor) && mb_strlen($valor) < (int) $arg) {
                        $this->errores[$campo] = "Debe tener al menos {$arg} caracteres";
                        return;
                    }
                    break;

                case 'max':
                    if (is_numeric($valor) && (float) $valor > (float) $arg) {
                        $this->errores[$campo] = "El valor maximo es {$arg}";
                        return;
                    }
                    if (is_string($valor) && mb_strlen($valor) > (int) $arg) {
                        $this->errores[$campo] = "Debe tener como maximo {$arg} caracteres";
                        return;
                    }
                    break;

                case 'en':
                    $opciones = explode(',', (string) $arg);
                    if (!in_array((string) $valor, $opciones, true)) {
                        $this->errores[$campo] = 'Valor no permitido: ' . implode(', ', $opciones);
                        return;
                    }
                    break;

                case 'arreglo':
                    if (!is_array($valor)) {
                        $this->errores[$campo] = 'Debe ser una lista';
                        return;
                    }
                    if ($valor === [] && $esRequerido) {
                        $this->errores[$campo] = 'La lista no puede estar vacia';
                        return;
                    }
                    break;

                case 'uuid':
                    if (!is_string($valor)
                        || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $valor) !== 1) {
                        $this->errores[$campo] = 'Identificador invalido';
                        return;
                    }
                    break;

                case 'existe':
                    // existe:tabla,columna  -> verifica integridad antes de insertar
                    [$tabla, $columna] = array_pad(explode(',', (string) $arg), 2, 'id');
                    if (!DB::existe("SELECT 1 FROM `{$tabla}` WHERE `{$columna}` = ? LIMIT 1", [$valor])) {
                        $this->errores[$campo] = 'El registro referenciado no existe';
                        return;
                    }
                    break;

                case 'unico':
                    // unico:tabla,columna[,idAExcluir]
                    $partes = explode(',', (string) $arg);
                    $tabla = $partes[0];
                    $columna = $partes[1] ?? $campo;
                    $excluir = $partes[2] ?? null;
                    $sql = "SELECT 1 FROM `{$tabla}` WHERE `{$columna}` = ?";
                    $params = [$valor];
                    if ($excluir !== null && $excluir !== '') {
                        $sql .= ' AND id <> ?';
                        $params[] = $excluir;
                    }
                    if (DB::existe($sql . ' LIMIT 1', $params)) {
                        $this->errores[$campo] = 'Ya existe un registro con este valor';
                        return;
                    }
                    break;
            }
        }

        $this->limpios[$campo] = $valor;
    }
}
