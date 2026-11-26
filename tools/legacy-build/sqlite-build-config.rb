module Unlight
  STORE_TYPE = :sqlite3
  MEMCACHE_CONFIG = "127.0.0.1:#{Integer(ENV.fetch('UNLIGHT_DATA_WORK_CACHE_PORT'))}"
  MEMCACHE_OPTIONS = { timeout: 1, namespace: 'unlight-data-work' }
end
