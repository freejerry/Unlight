# Unlight
# Copyright(c)2019 CPA
# This software is released under the MIT License.
# http://opensource.org/licenses/mit-license.php

module Unlight


  # ゲームセッションログ
  class AvatarNotice < Sequel::Model

    # 他クラスのアソシエーション
    one_to_one :avatar

    # プラグインの設定
    plugin :schema
    plugin :validation_class_methods
    plugin :hook_class_methods
    plugin :caching, CACHE, :ignore_exceptions=>true

    # スキーマの設定
    set_schema do
      primary_key :id
      integer     :avatar_id,:index=>true #, :table => :avatars
      String      :body, :text=>true, :default => ""
      datetime    :created_at
      datetime    :updated_at
      datetime    :send_at
    end

    # バリデーションの設定
    validates do
    end

    # DBにテーブルをつくる

    if !(AvatarNotice.table_exists?) #テーブルをリセットするときにコメントアウト
      AvatarNotice.create_table
    end

    DB.alter_table :avatar_notices do
      add_column :send_at, :datetime unless Unlight::AvatarNotice.columns.include?(:send_at)  # 新規追加2012/01
    end


    # インサート時の前処理
    before_create do
       self.created_at = Time.now.utc
    end

    # インサートとアップデート時の前処理
    before_save do
       self.updated_at = Time.now.utc
    end

    # Use the owning avatar's row even when the first notice does not exist yet.
    SQLITE_NOTICE_LOCK = Mutex.new

    def self.with_owner_lock(avatar_id)
      options = DB.database_type == :sqlite ? { :mode => :immediate } : {}
      operation = proc do
        DB.transaction(options) do
          yield if DB[:avatars].where(:id => avatar_id).for_update.get(:id)
        end
      end
      if DB.database_type == :sqlite && !DB.in_transaction?
        # The legacy SQLite driver's busy handler can block another Ruby thread from finishing.
        SQLITE_NOTICE_LOCK.synchronize(&operation)
      else
        operation.call
      end
    end

    def self.write_notice(avatar_id, message)
      with_owner_lock(avatar_id) do
        notice = where(:avatar_id => avatar_id).order(:id).first
        if notice
          notice.body = (notice.body.to_s.split("|") + [message]).join("|").force_encoding("UTF-8")
          notice.save_changes
        else
          create(:avatar_id => avatar_id, :body => message)
        end
      end
    end

    # Pop only notices eligible for this command, keeping the original newest-first order.
    def self.clear_types(avatar_id, count, types, matching)
      return [] unless count && count > 0

      with_owner_lock(avatar_id) do
        removed = []
        where(:avatar_id => avatar_id).order(Sequel.desc(:id)).each do |notice|
          break if removed.length == count
          tokens = notice.body.to_s.split("|")
          candidates = tokens.each_index.select { |i| types.include?(tokens[i].to_i) == matching }
          candidates.last(count - removed.length).reverse_each do |index|
            removed << tokens.delete_at(index)
          end
          notice.body = tokens.join("|").force_encoding("UTF-8")
          notice.save_changes
        end
        removed
      end
    end

    # スタックしている未送信のメッセージを配列で取得
    def AvatarNotice::get_massage_notice(time)
      AvatarNotice.filter(Sequel.cast_string(:updated_at) > time ).and(~{:body => ""}).all
    end

  end

end
