package {
    import flash.display.BitmapData;
    import flash.display.DisplayObject;
    import flash.display.DisplayObjectContainer;
    import flash.display.Loader;
    import flash.display.Sprite;
    import flash.events.Event;
    import flash.events.IOErrorEvent;
    import flash.events.SecurityErrorEvent;
    import flash.external.ExternalInterface;
    import flash.geom.Matrix;
    import flash.geom.Rectangle;
    import flash.net.URLRequest;
    import flash.utils.ByteArray;

    [SWF(width="290", height="450", frameRate="24")]
    public class AvatarAssetExport extends Sprite {
        private const RIG:String = "/bundle/data/image/avatar_rig.swf";
        private const PART_PREFIX:String = "/bundle/public/image/avatar_parts/";
        private var source:Sprite = new Sprite();
        private var rig:Loader;
        private var parts:Array = [];
        private var outstanding:int;
        private var frames:int;
        private var failed:Boolean;

        public function AvatarAssetExport() {
            var parameters:Object = loaderInfo.parameters;
            if (parameters.rig !== RIG || parameters.partPrefix !== PART_PREFIX || !parameters.parts) {
                fail("Invalid avatar asset paths");
                return;
            }
            var names:Array = String(parameters.parts).split("|");
            var seen:Object = {};
            var partName:RegExp = /^[A-Za-z0-9_]+_p[0-9]{1,3}$/;
            if (names.length < 1 || names.length > 128) {
                fail("Invalid avatar part count");
                return;
            }
            for each (var name:String in names) {
                if (!partName.test(name) || seen[name]) {
                    fail("Invalid avatar part name");
                    return;
                }
                seen[name] = true;
            }
            source.visible = false;
            addChild(source);
            outstanding = names.length + 1;
            rig = loadOriginal(RIG);
            for each (name in names) {
                parts.push({name: name, loader: loadOriginal(PART_PREFIX + name + ".swf")});
            }
            addEventListener(Event.ENTER_FRAME, exportWhenReady);
        }

        private function loadOriginal(path:String):Loader {
            var loader:Loader = new Loader();
            source.addChild(loader);
            loader.contentLoaderInfo.addEventListener(Event.COMPLETE, loaded);
            loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, failedLoad);
            loader.contentLoaderInfo.addEventListener(SecurityErrorEvent.SECURITY_ERROR, failedLoad);
            try {
                loader.load(new URLRequest(path));
            } catch (error:Error) {
                fail(error.message);
            }
            return loader;
        }

        private function loaded(event:Event):void {
            outstanding -= 1;
        }

        private function failedLoad(event:Event):void {
            fail(event.toString());
        }

        private function exportWhenReady(event:Event):void {
            // AvatarClip's DrawThread allows the source display list to settle before caching.
            if (failed || outstanding > 0 || ++frames <= 9) return;
            removeEventListener(Event.ENTER_FRAME, exportWhenReady);
            try {
                var anchors:DisplayObjectContainer = rig.content as DisplayObjectContainer;
                if (!anchors || anchors.numChildren !== 15) throw new Error("Unexpected avatar rig anchors");
                for (var i:int = 0; i < anchors.numChildren; i += 1) {
                    var anchor:DisplayObject = anchors.getChildAt(i);
                    ExternalInterface.call("avatarExportAnchor", anchor.name, anchor.x, anchor.y);
                }
                for each (var part:Object in parts) exportPart(part.name, part.loader.content);
                ExternalInterface.call("avatarExportDone");
            } catch (error:Error) {
                fail(error.message);
            }
        }

        private function exportPart(name:String, image:DisplayObject):void {
            if (!image) throw new Error("Missing avatar part " + name);
            var bounds:Rectangle = image.getBounds(image);
            if (bounds.isEmpty()) {
                ExternalInterface.call("avatarExportPart", name, 0, 0, 0, 0, "");
                return;
            }
            var x:int = Math.floor(bounds.left);
            var y:int = Math.floor(bounds.top);
            var width:int = Math.ceil(bounds.right) - x;
            var height:int = Math.ceil(bounds.bottom) - y;
            if (width < 1 || width > 512 || height < 1 || height > 512) {
                throw new Error("Unexpected avatar image bounds for " + name);
            }
            var bitmap:BitmapData = new BitmapData(width, height, true, 0);
            bitmap.draw(image, new Matrix(1, 0, 0, 1, -x, -y), null, null, null, true);
            var pixels:ByteArray = bitmap.getPixels(bitmap.rect);
            bitmap.dispose();
            pixels.position = 0;
            var channels:Array = [];
            while (pixels.bytesAvailable >= 4) {
                channels.push(("00000000" + pixels.readUnsignedInt().toString(16)).substr(-8));
            }
            ExternalInterface.call("avatarExportPart", name, x, y, width, height, channels.join(""));
        }

        private function fail(message:String):void {
            if (failed) return;
            failed = true;
            removeEventListener(Event.ENTER_FRAME, exportWhenReady);
            ExternalInterface.call("avatarExportFailed", message);
        }
    }
}
