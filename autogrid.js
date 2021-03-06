(function($){
	$.fn.autogrid = function(options) {
		// trigger a resize event on the window after 100ms to cause the grid
		// to update after width data is fully available (doing it straight after bind
		// has a tendency to miscalculate)
		setTimeout(function() {
			$(window).resize()
		}, 100)
		return this.each(function() {
			var base = this
			base.info = {}
			base.defaults = {
				'add_row_wrapper': true, // wether to append .clear-row divs between rows to help with clearing.
				'default_min' : 200,
				'default_max' : 9999, // this allows elements to scale upwards infinitely, filling rows at will
				'use_ratios' : true, // wether to scale in proportion to the min size of each element or distribute available width equally
				'body_adjust_size' : 6, // a bugfix - not happy about this atm,
				'sort_rows' : false,
				'reverse' : false
			}
			base.options = $.extend({}, base.defaults, options)

			// get the width of the parent object, and cache
			// it. encapsulated so that the method can be
			// changed quickly if it's wrong.
			base.get_parent_width = function() {
				base.info.width = $(base).width() - base.options.body_adjust_size
				return base.info.width
			}

			// updates the min+max width info on all children. In
			// most cases this can be executed once per page load to
			// reduce DOM read stress (minimal anyway), but if there
			// is another force acting on these attributes then manually
			// updating the child sizes is required.
			base.update_child_sizes = function() {
				base.info.children = []
				$(base).children().each(function() {
					// parse to int both min and max width
					min = base._parse_size($(this).css('min-width'), base._parse_size($(this).css('width'), base.options.default_min))
					max = base._parse_size($(this).css('max-width'), base.options.default_max)
					border = base._parse_size($(this).css('border-left-width'), 0) + base._parse_size($(this).css('border-right-width'), 0)
					padding = base._parse_size($(this).css('padding-left'), 0) + base._parse_size($(this).css('padding-right'), 0)
					margin = base._parse_size($(this).css('margin-left'), 0) + base._parse_size($(this).css('margin-right'), 0)

					// save the data both to the base info array and to the child as data
					base.info.children.push({ element: this, min: min, max: max, extra: border + margin + padding})
					$(this).data('size', { min : min, max : max, extra: border + margin})
				})
				return base.info.children
			}
			// takes something like "600px" (string) and returns 600 (integer)
			// if the input contained no numbers, it returns def
			base._parse_size = function(num, def) {
				m = num.match(/[0-9]+/g)
				return (m ? parseInt(m.join('')) : def)
			}

			// this splits the child elements into rows that have
			// a total min-width less than that of the parent.
			// each row is passed to the "scale row" function when
			// the row is filled.
			base.update_grid = function() {
				var p_width = base.get_parent_width(),
					kids = base.info.children,
					row_width = 0,
					row_kids = [],
					rows = []

				$(base).find('.clear-row').each(base.unwrap_row)
				$(kids).each(function() {
					// if adding this element will cause the row to wrap
					// then scale the old row and start a new one.
					if (row_width + (this.min + this.extra) > p_width) {
						if (row_kids.length) {
							base.scale_row(p_width, row_width, row_kids)
							base.wrap_row(row_kids)
							rows.push(row_kids)
						}
						row_width = 0
						row_kids = []
					}

					row_width += (this.min + this.extra)
					row_kids.push(this)
				})
				if (row_kids.length) {
					base.scale_row(p_width, row_width, row_kids)
					base.wrap_row(row_kids)
					rows.push(row_kids)
				}

				// are we reversing (flipping the stacking of heights)?
			}

			base.unwrap_row = function() {
				$(this).children(':not(.row-clear)').insertAfter(this)
				$(this).remove()
			}

			base.wrap_row = function(row) {
				if (base.options.add_row_wrapper) {
					var wrap = $('<div />')
					wrap.addClass('clear-row')
					wrap.addClass('contains-' + row.length)
					wrap.insertBefore(row[0].element)
					for (var i in row) {
						$(row[i].element).appendTo(wrap)
					}
					$('<div />').addClass('row-clear').css({
						display: 'block',
						width: '100%',
						height: 0,
						clear: 'both'
					}).appendTo(wrap)
				}
			}

			base.scale_row = function(p_width, row_width, row_kids) {
				// get the ratios of the child elements such
				// that we scale child elements proportional
				// to how much their min-width contributed to
				// the row width.
				var ratios = [],
					rmin = Math.min(), rmax = Math.max(),
					rsum = 0, total_added = 0,
					rmax_index = 0,
					difference, plus, kid_width

				if (base.options.use_ratios) {
					for (var i in row_kids) {
						var w = row_width * row_kids[i].min
						ratios.push(w)
						rmin = Math.min(rmin, w)
						if (w > rmax) {
							rmax = w
							rmax_index = i
						}
					}
					// rebase so lowest ratio is 1, as ratios prior
					// to this stage are in the 500 - 30000 range.
					// get sum at same time
					for (var i in ratios) {
						ratios[i] /= rmin
						rsum += ratios[i]
					}
				} else {
					// if we aren't using ratios then just fill an array with 1's
					// and stick any additional size onto the smallest element
					for (var i in row_kids) {
						ratios.push(1)
						if (row_kids.min < rmin) {
							rmin = row_kids.min
							rmax_index = i
						}
					}
					// rsum is same as number of elements
					rsum = row_kids.length
				}

				difference = p_width - row_width
				plus = Math.floor(difference / rsum)

				// add it on to the kids...
				for (var i in row_kids) {
					// the width is the minimum of:
					//   - the min width + the scaled remainder
					//   - the max width
					kid = row_kids[i]
					kid.width = Math.min(Math.floor(kid.min + (plus * ratios[i])), kid.max)
					total_added += (kid.width + kid.extra)
					jQuery(kid.element).width(kid.width)
				}

				// sort kids by available width for optimal distributions
				row_kids = row_kids.sort(function(a, b) {
					return ((a.max - a.width) < (b.max - b.width))
				})

				// attempt to distribute all remaining space amongst children
				// without preference for ratios or equality.
				i = 0
				difference = p_width - total_added
				while (i < row_kids.length && difference > 0) {
					kid = row_kids[i]

					diff = Math.min(kid.max, difference)

					kid.width += diff
					difference -= diff

					$(kid.element).width(kid.width)

					i++
				}

			}

			// update child widths. Do this once.
			base.update_child_sizes()

			// bind "update_grid" on window resize
			// trigger here as well but it will fail slightly
			jQuery(window).resize(base.update_grid)//.resize()
		})
	}

})(jQuery);
