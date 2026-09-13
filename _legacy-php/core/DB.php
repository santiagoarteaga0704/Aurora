<?php
declare(strict_types=1);

namespace Core;

use PDO;
use PDOStatement;

/**
 * Acceso a datos sobre PDO. No es un ORM: expone consultas preparadas y unos
 * pocos ayudantes para no repetir el mismo bloque de bind en cada modulo.
 */
final class DB
{
    private static ?PDO $pdo = null;
    private static int $nivelTransaccion = 0;

    public static function conn(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            Env::get('DB_HOST', '127.0.0.1'),
            Env::get('DB_PORT', '3306'),
            Env::requerido('DB_NAME')
        );

        self::$pdo = new PDO(
            $dsn,
            Env::requerido('DB_USER'),
            Env::get('DB_PASS', '') ?? '',
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // sin emulacion: los tipos vuelven correctos y los prepares son reales
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
            ]
        );

        // la app trabaja siempre en la zona horaria de Bolivia
        self::$pdo->exec("SET time_zone = '-04:00'");

        return self::$pdo;
    }

    /** @param array<string,mixed>|list<mixed> $params */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::conn()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * @param array<string,mixed>|list<mixed> $params
     * @return list<array<string,mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    /**
     * @param array<string,mixed>|list<mixed> $params
     * @return array<string,mixed>|null
     */
    public static function first(string $sql, array $params = []): ?array
    {
        $fila = self::run($sql, $params)->fetch();
        return $fila === false ? null : $fila;
    }

    /** @param array<string,mixed>|list<mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        $valor = self::run($sql, $params)->fetchColumn();
        return $valor === false ? null : $valor;
    }

    public static function existe(string $sql, array $params = []): bool
    {
        return self::first($sql, $params) !== null;
    }

    /** @param array<string,mixed> $datos */
    public static function insert(string $tabla, array $datos): int
    {
        $columnas = array_keys($datos);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $tabla,
            implode(', ', array_map(static fn(string $c): string => "`{$c}`", $columnas)),
            implode(', ', array_map(static fn(string $c): string => ":{$c}", $columnas))
        );
        self::run($sql, $datos);
        return (int) self::conn()->lastInsertId();
    }

    /**
     * @param array<string,mixed> $datos
     * @param array<string,mixed> $paramsWhere
     */
    public static function update(string $tabla, array $datos, string $where, array $paramsWhere = []): int
    {
        if ($datos === []) {
            return 0;
        }
        $asignaciones = [];
        $params = [];
        foreach ($datos as $columna => $valor) {
            $asignaciones[] = "`{$columna}` = :set_{$columna}";
            $params["set_{$columna}"] = $valor;
        }
        $sql = sprintf('UPDATE `%s` SET %s WHERE %s', $tabla, implode(', ', $asignaciones), $where);
        return self::run($sql, array_merge($params, $paramsWhere))->rowCount();
    }

    public static function delete(string $tabla, string $where, array $params = []): int
    {
        return self::run("DELETE FROM `{$tabla}` WHERE {$where}", $params)->rowCount();
    }

    /**
     * Transaccion con soporte de anidamiento por SAVEPOINT: un modulo puede
     * abrir su propia transaccion aunque ya haya una en curso mas arriba.
     */
    public static function transaction(callable $fn): mixed
    {
        $pdo = self::conn();
        $esRaiz = self::$nivelTransaccion === 0;

        if ($esRaiz) {
            $pdo->beginTransaction();
        } else {
            $pdo->exec('SAVEPOINT sp' . self::$nivelTransaccion);
        }
        self::$nivelTransaccion++;

        try {
            $resultado = $fn();
            self::$nivelTransaccion--;
            if ($esRaiz) {
                $pdo->commit();
            } else {
                $pdo->exec('RELEASE SAVEPOINT sp' . self::$nivelTransaccion);
            }
            return $resultado;
        } catch (\Throwable $e) {
            self::$nivelTransaccion--;
            if ($esRaiz) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
            } else {
                $pdo->exec('ROLLBACK TO SAVEPOINT sp' . self::$nivelTransaccion);
            }
            throw $e;
        }
    }

    /**
     * Genera un correlativo por prefijo y anio: PED-2026-000123.
     * Se llama dentro de una transaccion para evitar numeros duplicados.
     */
    public static function siguienteNumero(string $tabla, string $prefijo): string
    {
        $anio = date('Y');
        $patron = "{$prefijo}-{$anio}-%";
        $ultimo = self::value(
            "SELECT numero FROM `{$tabla}` WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1 FOR UPDATE",
            [$patron]
        );
        $secuencia = $ultimo === null ? 1 : ((int) substr((string) $ultimo, -6)) + 1;
        return sprintf('%s-%s-%06d', $prefijo, $anio, $secuencia);
    }
}
