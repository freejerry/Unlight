require 'eventmachine'
require 'sequel'

# Old controller queries use blank? on values returned by Sequel 4.
Sequel.extension :blank

class << EM
  alias_method :original_start_server, :start_server

  def start_server(_host, *args)
    original_start_server('127.0.0.1', *args)
  end
end
