<?php
/**
 * Provenance tool for the WordPress gallery entry.
 *
 * Runs WordPress' own schema generator - wp_get_db_schema() from
 * wp-admin/includes/schema.php at a pinned release tag - without a web
 * server or database, producing the exact DDL a fresh single-site install
 * creates. The downloaded schema.php stays in work/ (never committed);
 * this script and the DDL's derived stats are what we publish.
 *
 * Usage: php extract.php <schema.php-path> > work/wp-<version>.sql
 */

error_reporting( E_ALL );

if ( ! function_exists( 'is_multisite' ) ) {
	function is_multisite() {
		return false;
	}
}

class WpdbShim {
	public $prefix      = 'wp_';
	public $base_prefix = 'wp_';
	public $blogid      = 1;

	public function __get( $name ) {
		return 'wp_' . $name;
	}

	/**
	 * What a real wpdb returns on a default utf8mb4 install. The collate
	 * component is MySQL-version-dependent, so we emit the charset only —
	 * it changes index widths, not the schema structure this gallery draws.
	 */
	public function get_charset_collate() {
		return 'DEFAULT CHARACTER SET utf8mb4';
	}
}

$GLOBALS['wpdb']         = new WpdbShim();
$GLOBALS['table_prefix'] = 'wp_';

$schema_file = $argv[1] ?? __DIR__ . '/work/schema.php';
require $schema_file;

header( 'Content-Type: text/plain' );
echo wp_get_db_schema( 'utf8mb4' );
