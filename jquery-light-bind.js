/**
 * Created by Роман on 27.06.2015.
 */

(function ($) {

	/*
	 * object.watch polyfill (required for lightBind)
	 *
	 * 2012-04-03
	 *
	 * By Eli Grey, http://eligrey.com
	 * Public Domain.
	 * NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
	 */
// object.watch
	if (!Object.prototype.watch) {
		Object.defineProperty(Object.prototype, "watch", {
			enumerable: false
			, configurable: true
			, writable: false
			, value: function (prop, handler) {
				var
					oldval = this[prop]
					, newval = oldval
					, getter = function () {
						return newval;
					}
					, setter = function (val) {
						oldval = newval;
						return newval = handler.call(this, prop, oldval, val);
					}
					;

				if (delete this[prop]) { // can't watch constants
					Object.defineProperty(this, prop, {
						get: getter
						, set: setter
						, enumerable: true
						, configurable: true
					});
				}
			}
		});
	}

// object.unwatch
	if (!Object.prototype.unwatch) {
		Object.defineProperty(Object.prototype, "unwatch", {
			enumerable: false
			, configurable: true
			, writable: false
			, value: function (prop) {
				var val = this[prop];
				delete this[prop]; // remove accessors
				this[prop] = val;
			}
		});
	}


	// lightBind plugin

	var jQueryDataKey = 'lightBind';

	var methods = {
		init: function(options){

			var settings = $.extend({
				data: {},
				processors: {},
				initializeElements: true,
				onDataUpdate: null,
				onViewUpdate: null
			}, options);

			settings.blocks = {}; // to block mutual updates

			//console.debug('.lightBind', this);
			this.each(function(){
				var $root = $(this);
				var data = $root.data(jQueryDataKey);
				if (!data) {
					// initialization
					$root.data(jQueryDataKey, {settings: settings});

					var $boundAll = methods._boundElements.call($root);
					$boundAll.each(function(){
						methods._linkElement(this, settings, $boundAll);
					});
				}
			});

			if (settings.initializeElements)
				this.lightBind('updateView');
			return this;
		},

		destroy: function(){
			return this.each(function() {
				var $root = $(this);
				var data = $root.data(jQueryDataKey);
				if (!data)
					return; // not initialized
				var settings = data.settings;
				var $boundAll = methods._boundElements.call($root);
				$boundAll.each(function () {
					methods._unlinkElement(this, settings);
				});

				$boundAll.off('.' + jQueryDataKey);

				$root.data(jQueryDataKey, null);
			});
		},

		updateView: function(){
			//console.debug('.updateView');
			return this.each(function(){
				var $root = $(this);
				//console.debug('.each', this);
				var $boundAll = methods._boundElements.call($root);
				if ($boundAll.length > 0) {
					var settings = $root.data(jQueryDataKey).settings;
					$boundAll.each(function () {
						var $boundCurrent = $(this);
						var objKey = $boundCurrent.attr('data-bind');

						//getting value
						var val = methods._modelToViewValue(this, settings, objKey);
						methods._updateElementValue(this, val, $boundAll);
					});
				}
			});
		},

		_boundElements: function(){
			return this.filter('[data-bind]').add(this.find('[data-bind]'));
		},

		_updateElementValue: function(element, value, $boundAll){
			var $element = $(element);

			if ($element.is('input')) {
				var type = $element.attr('type').toLowerCase();
				//console.warn('input found', type, element);
				if (type == 'radio'){
					var filter = '[name='+$element.attr('name')+'][value='+value+']';
					if ($boundAll.filter(filter+':checked').length == 0) // needed value is not checked
						$boundAll.filter(filter).prop('checked', true);
				} else if (type == 'checkbox'){
					$element.prop('checked', !!value);
				} else {
					$element.val(value);
				}
			} else if ($element.is('a')){
				//console.warn('link found', element);
				$element.attr('href', value).html(value);
			} else if ($element.is('textarea')) {
				$element.val(value);
			} else if ($element.is('select')){
				$element.prop('value', value);
			} else {
				//console.warn('other element found', element);
				$element.html(value);
			}
		},

		_getProcessor: function(element, settings){
			var $element = $(element);
			var processorKey = $element.attr('data-bind-processor');
			if (processorKey && settings.processors)
				return settings.processors[processorKey] || {};
			else
				return {};
		},

		_modelToViewValue: function(element, settings, objKey, overriddenModelValue){
			var processor = methods._getProcessor(element, settings).modelToView;

			if (typeof(overriddenModelValue) != 'undefined')
				var val = overriddenModelValue;
			else
				val = methods._getObjValue(settings.data, objKey);

			if (processor) {
				// use processor
				return processor(
					element,
					val
				);
			} else {
				return val;
			}
		},

		_viewToModelValue: function(element, settings, objKey, elementValueToUpdateModel){
			var $boundCurrent = $(element);
			var processor = methods._getProcessor(element, settings).viewToModel;

			if (processor) {
				// use processor
				return processor(
					element,
					elementValueToUpdateModel
				);
			} else
				return elementValueToUpdateModel;
		},

		_linkElement: function(element, settings, $boundAll){
			var $element = $(element);
			var objKey = $element.attr('data-bind');
			delete settings.blocks[objKey];

			function genEventsKeys(events) {
				if (events){
					var baseArray = events.split(' ');
					return $.map(baseArray, function(element){
						return element+'.'+jQueryDataKey;
					}).join(' ');
				} else {
					$.error('events was not specified!');
				}
			}

			function updateModel(elementValue) {
				if (settings.blocks[objKey]) {
					delete settings.blocks[objKey];
				} else {
					settings.blocks[objKey] = true;
					var newModelValue = methods._viewToModelValue(element, settings, objKey, elementValue);
					methods._setObjValue(settings.data, objKey, newModelValue);
					if ($.isFunction(settings.onDataUpdate))
						settings.onDataUpdate(element, objKey, elementValue);
				}
			}

			methods._addObjValueSetter(settings, objKey, function(prop, lastVal, newVal){
				if (settings.blocks[objKey]) {
					delete settings.blocks[objKey];
				} else {
					settings.blocks[objKey] = true;
					var val = methods._modelToViewValue(element, settings, objKey, newVal);
					methods._updateElementValue(element, val, $boundAll);
					settings.blocks[objKey] = false;
					if ($.isFunction(settings.onViewUpdate))
						settings.onViewUpdate(element, objKey, newVal);
				}
				return newVal;
			});

			if ($element.is('input[type=checkbox]')) {
				$element.on(genEventsKeys('change'), function(){
					updateModel(!!$(this).prop('checked'));
				});
			} else {
				var lastVal = null;
				var isRadio = $element.is('input[type=radio]');
				var events = genEventsKeys('change keyup input');
				$element.off(events);
				$element.on(events, function () {
					var val = $(this).val();
					if (isRadio) {
						updateModel(val);
					} else {
						if (val == lastVal && lastVal != null)
							return;
						updateModel(val);
						lastVal = val;
					}
				});
			}
		},

		_unlinkElement: function(element, settings){
			var $element = $(element);
			var objKey = $element.attr('data-bind');
			methods._removeObjValueSetter(settings, objKey);
		},

		_getObjValue: function(data, pathStr){
			if (!data)
				return null;
			var obj = data;
			var path = pathStr.split('.');
			for (var i = 0, cnt = path.length; i < cnt; i++){
				if (!obj)
					break;
				obj = obj[path[i]];
			}
			return obj;
		},

		_setObjValue: function(data, pathStr, value){
			if (!data)
				return null;
			var obj = data;
			var path = pathStr.split('.');
			var lastKey = path[path.length-1];
			for (var i = 0, cnt = path.length; i < cnt-1; i++){
				if (!obj[path[i]])
					obj[path[i]] = {};
				obj = obj[path[i]];
			}
			obj[lastKey] = value;
		},

		_addObjValueSetter: function(settings, pathStr, setter) {
			if (!settings || !settings.data)
				return null;
			var obj = settings.data;
			var path = pathStr.split('.');
			var lastKey = path[path.length - 1];
			for (var i = 0, cnt = path.length; i < cnt - 1; i++) {
				if (!obj[path[i]])
					obj[path[i]] = {};
				obj = obj[path[i]];
			}
			if (typeof(obj) == 'object')
				obj.watch(lastKey, setter);
			else
				$.error('Object not found at pathStr: '+pathStr);
		},

		_removeObjValueSetter: function(settings, pathStr){
			if (!settings || !settings.data)
				return null;
			var obj = settings.data;
			var path = pathStr.split('.');
			var lastKey = path[path.length - 1];
			for (var i = 0, cnt = path.length; i < cnt - 1; i++) {
				if (!obj)
					break;
				obj = obj[path[i]];
			}
			obj.unwatch(lastKey);
		}
	};

	$.fn.lightBind = function(method){
		if (!method)
			$.error('Method is not specified!');
		if (method[0] == '_') // don't call private methods
			return this;

		if ( methods[method] ) {
			return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else if ( typeof method === 'object' || ! method ) {
			return methods.init.apply( this, arguments );
		} else {
			$.error( 'Unknown method '+method );
		}
	};
})(jQuery);
