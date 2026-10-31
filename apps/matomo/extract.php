<?php
/**
 * Provenance tool for the Matomo gallery entry.
 *
 * Runs Matomo's own schema class - core/Db/Schema/Mysql.php at a pinned
 * release tag - through PHP with stubbed infrastructure classes, producing
 * the exact CREATE TABLE set a fresh install executes. Mirrors Matomo's
 * install flow (Schema::createTables): archive_blob and archive_numeric are
 * excluded because the installer itself skips them (the archiver creates
 * dated archive tables lazily at first run).
 *
 * Defaults rendered (Matomo's documented config defaults): table prefix
 * `matomo_`, engine InnoDB, charset utf8mb4, no collation/row-format override.
 *
 * Usage: php extract.php <Mysql.php-path> > work/matomo-<version>.sql
 * (the downloaded Mysql.php stays in work/, never committed)
 */

namespace Piwik\Db {
	class Settings {
		public function getTablePrefix() { return 'matomo_'; }
		public function getEngine() { return 'InnoDB'; }
		public function getUsedCharset() { return 'utf8mb4'; }
		public function getUsedCollation() { return ''; }
		public function getRowFormat() { return ''; }
		public function getDbName() { return 'matomo'; }
	}

	interface SchemaInterface {
	}
}

namespace Piwik\Plugins\UsersManager {
	class Model {
		// real value from plugins/UsersManager/Model.php @ 5.14.2 (line 55)
		public const MAX_LENGTH_TOKEN_DESCRIPTION = 100;
	}
}

namespace Piwik\Concurrency {
	class Lock {
		// real value from core/Concurrency/Lock.php @ 5.14.2 (line 17)
		public const MAX_KEY_LEN = 70;
	}
}

namespace Piwik {
	class Version {
		public const VERSION = '5.14.2';
	}
}

namespace {
	error_reporting( E_ALL );

	$schema_file = $argv[1] ?? __DIR__ . '/work/Mysql.php';
	require $schema_file;

	$schema   = new \Piwik\Db\Schema\Mysql();
	$tables   = $schema->getTablesCreateSql();
	$excluded = array( 'archive_blob', 'archive_numeric' );

	foreach ( $excluded as $skip ) {
		unset( $tables[ $skip ] );
	}

	foreach ( $tables as $table_sql ) {
		// Matomo's raw statements carry no trailing semicolon (the installer
		// queries them one at a time) - add it for statement-splitting importers
		echo rtrim( $table_sql ), ";\n\n";
	}

	echo '-- ', count( $tables ), ' tables (fresh install; ', implode( ', ', $excluded ), ' are created lazily by the archiver)', "\n";
}
