/**
 * Created by Роман on 27.06.2015.
 */

(function ($) {

	/*
	 * object.watch polyfill
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



	var jQueryDataKey = 'lightBind';

	var methods = {
		init: function(options){

			var settings = $.extend({
				data: {},
				processors: {},
				initializeElements: true
			}, options);

			//console.debug('.lightBind', this);
			this.each(function(){
				var $root = $(this);
				var data = $root.data(jQueryDataKey);
				if (!data) {
					// initialization
					$root.data(jQueryDataKey, {settings: settings});

					var $boundAll = methods._boundElements.call($root);
					$boundAll.each(function(){
						methods._linkElement.call(this, settings, $boundAll);
					});
				}
			});

			if (settings.initializeElements)
				this.lightBind('updateView');
			return this;
		},

		destroy: function(){
			var $boundAll = methods._boundElements.call(this);
			// todo: data unwatch()

			$boundAll.unbind('.'+jQueryDataKey);
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
						var val = methods._processValue(this, settings, objKey);
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
			} else {
				//console.warn('other element found', element);
				$element.html(value);
			}
		},

		_processValue: function(element, settings, objKey, elementValueToUpdateModel){
			var $boundCurrent = $(element);
			var processorKey = $boundCurrent.attr('data-bind-processor');
			if (processorKey && settings.processors)
				var processor = settings.processors[processorKey];

			var getObjValue = methods._getObjValue.bind(null, settings.data, objKey);
			var setObjValue = methods._setObjValue.bind(null, settings.data, objKey);

			if (processor) {
				// use processor
				return processor(
					element,
					getObjValue,
					setObjValue,
					elementValueToUpdateModel
				);
			} else {
				// no processor specified
				if (typeof (elementValueToUpdateModel) != 'undefined')
					setObjValue(elementValueToUpdateModel);
				else
					return getObjValue();
			}
		},

		_linkElement: function(settings, $boundAll){
			var mutualUpdateBlock = false;

			var $element = $(this);
			var objKey = $element.attr('data-bind');

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

			methods._addObjValueSetter(settings, objKey, function(prop, lastVal, newVal){
				setTimeout(function () {
					if (mutualUpdateBlock) {
						mutualUpdateBlock = false;
					} else {
						mutualUpdateBlock = true;
						var val = methods._processValue($element, settings, objKey);
						methods._updateElementValue($element, val, $boundAll);
						console.log("update element", val);
					}
				}, 1);
				return newVal;
			});

			function updateModel(val) {
				if (mutualUpdateBlock) {
					mutualUpdateBlock = false;
				} else {
					mutualUpdateBlock = true;
					console.log("update model", val);
					methods._processValue(this, settings, objKey, val);
				}
			}

			if ($element.is('input[type=checkbox]')) {
				$element.on(genEventsKeys('change'), function(){
					updateModel(!!$(this).prop('checked'));
				});
			} else {
				var lastVal = '';
				$element.on(genEventsKeys('change keyup input'), function () {
					var val = $(this).val();
					if (val == lastVal)
						return;
					updateModel(val);
					lastVal = val;
				});
			}
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
				if (!obj)
					break;
				obj = obj[path[i]];
			}
			obj[lastKey] = value;
		},

		_addObjValueSetter: function(settings, pathStr, setter){
			if (!settings || !settings.data)
				return null;
			var obj = settings.data;
			var path = pathStr.split('.');
			var lastKey = path[path.length-1];
			for (var i = 0, cnt = path.length; i < cnt-1; i++){
				if (!obj)
					break;
				obj = obj[path[i]];
			}
			obj.watch(lastKey, setter);
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
