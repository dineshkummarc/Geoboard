gb.docs = [];
gb.localStoragePrefix = 'Geoboard-0.1-';
/**
 *
 * @param {String}
    *          title
 * @class GDoc
 * @constructor
 */
function GDoc(title, json) {
    var me = this, docNames, can, i, header;
    me.mouse = [ 0, 0 ];
    if (!title) {
        docNames = {};
        $.each(gb.docs, function (k, v) {
            docNames[v.title] = true;
        });
        for (i = 1; docNames[GDoc.prototype.title + i]; i++) {
            continue;
        }
        title = GDoc.prototype.title + i;
    }
    me.title = title;
    me.canvas = document.createElement('canvas');
    me.canvas.doc = me;
    me.canvasPhantom = document.createElement('canvas');
    me.canvasPhantom.doc = me;
    $(me.canvasPhantom).addClass('phantom');
    can = $(me.canvas).add(me.canvasPhantom);
    can.attr('width', 1).attr('height', 1);

    if (window.G_vmlCanvasManager) {
        window.G_vmlCanvasManager.initElement(me.canvas);
        window.G_vmlCanvasManager.initElement(me.contextPhantom);
    }

    $('div#area').append(can);
    function bindMe(name) {
        return function (ev) {
            return me[name](ev);
        };
    }

    if ($.isTouch) {
        can.bind('touchstart', bindMe('onTouchStart'));
        can.bind('touchmove', bindMe('onTouchMove'));
        can.bind('touchend', bindMe('onTouchEnd'));
    } else {
        can.mousedown(bindMe('onMouseDown'));
        can.mousemove(bindMe('onMouseMove'));
        can.mouseup(bindMe('onMouseUp'));
    }

    can.bind('DOMMouseWheel mousewheel', function (ev) {
        if (ev.ctrlKey || ev.metaKey) {
            me.zoom(Math.pow(1.1, ev.wheelDelta / 240), [ ev.offsetX, ev.offsetY]);
        } else {
            me.pan(ev.originalEvent.wheelDeltaX, ev.originalEvent.wheelDeltaY);
        }
        me.draw();
        ev.stopPropagation();
        ev.preventDefault();
    });

    me.context = me.canvas.getContext("2d");
    me.contextPhantom = me.canvasPhantom.getContext("2d");
    me.installContext();

    me.canvas.doc = me;
    me.lines = {};
    me.points = {};
    me.selection = {};
    me.__nextId = 100;
    me.cmdStack = [];
    me.cmdStackPos = 0;
    me.pageHeader = $('<li>' + me.title + '</li>');
    me.pageHeader.bind($.isTouch ? 'touchstart' : 'click', function () {
        if (gb.currentDoc === me) {
            me.pageHeader.innerHTML = "";
            header = $('<input type="text"/>').val(me.title);
            header.bind('keypress keyup keydown click',
                function (ev) {
                    if (ev.keyCode === 27) {
                        me.pageHeader.innerHTML = me.title;
                        me.die();
                    }
                    ev.stopPropagation();
                }).blur(
                function (ev) {
                    if (window.localStorage) {
                        delete window.localStorage[gb.localStoragePrefix + me.title];
                    }
                    me.title = header.val();
                    me.active();
                    me.save();
                    $(me.pageHeader).text(me.title);
                    header.die();
                }).focus();
            $(me.pageHeader).append(header);
        } else {
            me.active();
        }
    });

    $('#page-header').append(me.pageHeader);
    me.pageHeader = me.pageHeader[0];
    gb.docs.push(me);
    if (json) {
        me.load(json);
    }
}

GDoc.prototype = {

    title: 'Untitled',
    /**
     * @type Object
     */
    lines: {},
    /**
     * @type Object
     */
    points: {},

    updateMouse: function (ev) {
        var me = this;
        if (!$.isTouch) {
            this.mouse = this.context.transP2M([ ev.offsetX, ev.offsetY, 6 ]);
        } else {
            ev.shiftKey = false;
            ev.keyCode = 0;
            if (ev.targetTouches) {
                $.each(ev.targetTouches, function (i, touch) {
                    if (touch.identifier === me.currentTouch) {
                        var pos = $(me.canvas).offset();
                        me.mouse = me.context.transP2M([
                            touch.clientX - pos.left,
                            touch.clientY - pos.top
                        ]);
                        me.mouse[2] = 24;
                        return false;
                    }
                });
            } else {
                throw 'no targetTouches';
            }
        }
    },

    /**
     *
     * @param {TouchEvent} ev
     */
    onTouchStart: function (ev) {
        try {
            ev = ev.originalEvent;
            var me = this;
            if (ev.targetTouches && ev.targetTouches.length === 1) {
                me.currentTouch = ev.targetTouches[0].identifier;
                me.onMouseDown(ev);
            }
        } catch (e) {
            me.contextPhantom.fillStyle = "red";
            me.contextPhantom.fillText(e, 20, 20);
        }
    },

    onTouchMove: function (ev) {
        try {
            var currentTouch = null, me = this;
            ev = ev.originalEvent;
            if (ev.targetTouches) {
                $.each(ev.targetTouches, function (k, touch) {
                    if (touch.identifier === me.currentTouch) {
                        currentTouch = touch;
                        return false;
                    }
                });
                if (currentTouch) {
                    me.onMouseMove(ev);
                } else {
                    me.currentTouch = null;
                    me.onMouseUp(ev);
                }
            }
        } catch (e) {
            me.contextPhantom.fillStyle = "red";
            me.contextPhantom.fillText(e, 20, 20);
        }
    },

    onTouchEnd: function (ev) {
        try {
            ev = ev.originalEvent;
            var me = this, currentTouch;
            if (me.currentTouch) {
                $.each(ev.targetTouches, function (k, touch) {
                    if (touch.identifier === me.currentTouch) {
                        currentTouch = touch;
                        return false;
                    }
                });
                if (!currentTouch) {
                    me.onMouseUp(ev);
                    me.currentTouch = null;
                }
            }
        } catch (e) {
            me.contextPhantom.fillStyle = "red";
            me.contextPhantom.fillText(e, 20, 20);
        }
    },

    onMouseDown: function (ev) {
        try {
            var me = this;
            me.updateMouse(ev);
            ev.preventDefault();
            ev.stopPropagation();
            var os = gb.utils.shallowClone(me.selection);
            $('#menu').removeClass('expand');
            if ($.isTouch || ev.button === 0) {
                gb.currentTool.mouseDown(me, me.mouse[0], me.mouse[1], ev);
            }
            if (!gb.utils.eqo(me.selection, os)) {
                me.refreshMenu();
            }
        } catch (e) {
            me.contextPhantom.fillStyle = "red";
            me.contextPhantom.fillText(e, 20, 20);
        }
    },

    onMouseMove: function (ev) {
        try {
            var me = this;
            me.updateMouse(ev);
            ev.preventDefault();
            ev.stopPropagation();
            var os = gb.utils.shallowClone(me.selection);
            if (!gb.utils.eqo(me.selection, os)) {
                me.refreshMenu();
            }
            gb.currentTool.mouseMove(me, me.mouse[0], me.mouse[1], ev);
        } catch (e) {
            me.contextPhantom.fillStyle = "red";
            me.contextPhantom.fillText(e, 20, 20);
        }
    },

    onMouseUp: function (ev) {
        var me = this;
        me.updateMouse(ev);
        ev.preventDefault();
        ev.stopPropagation();
        var os = gb.utils.shallowClone(me.selection);
        gb.currentTool.mouseUp(me, me.mouse[0], me.mouse[1], ev);
        if (!gb.utils.eqo(me.selection, os)) {
            me.refreshMenu();
        }
        var pos = $(me.canvas).offset();
    },

    nextId: function () {
        return "ent" + this.__nextId++;
    },

    nextLabel: function (label) {
        var la = label.split('');
        for (var i = label.length - 1; i >= 0; i--) {
            var code = label.charCodeAt(i);
            if (code == 90 || code == 122) {
                la[i] = String.fromCharCode(code - 25);
                if (i == 0) {
                    la.push(la[i]);
                    return la.join('');
                }
            } else {
                la[i] = String.fromCharCode(code + 1);
                break;
            }
        }
        return la.join('');
    },

    nextPointLabel: function () {
        var me = this, label = 'A', lastLabel;
        do {
            lastLabel = label;
            me.forEntities(function (k, v) {
                if (v.isPoint) {
                    if (v.name === label) {
                        label = me.nextLabel(label);
                    }
                }
            });
        } while (label !== lastLabel);
        return label;
    },

    nextLineLabel: function () {
        var me = this, label = 'a', lastLabel;
        do {
            lastLabel = label;
            me.forEntities(function (k, v) {
                if (!v.isPoint) {
                    if (v.name === label) {
                        label = me.nextLabel(label);
                    }
                }
            });
        } while (label !== lastLabel);
        return label;
    },

    installContext: function () {
        var me = this;
        me.scaleFactor = 1;
        me.panX = 0;
        me.panY = 0;
        me.context.transM2P = function (p) {
            if (p instanceof Array) {
                p = p.slice(0);
                var w = me.canvas.clientWidth, h = me.canvas.clientHeight;
                p[0] += me.panX;
                p[1] += me.panY;
                p[0] *= me.scaleFactor;
                p[1] *= me.scaleFactor;
                p[0] += w * 0.5;
                p[1] += h * 0.5;
                return p;
            } else {
                return p * me.scaleFactor;
            }
        };

        me.context.transP2M = function (p) {
            if (p instanceof Array) {
                p = p.slice(0);
                var w = me.canvas.clientWidth, h = me.canvas.clientHeight;
                p[0] -= w * 0.5;
                p[1] -= h * 0.5;
                p[0] /= me.scaleFactor;
                p[1] /= me.scaleFactor;
                p[0] -= me.panX;
                p[1] -= me.panY;
                return p;
            } else {
                return p / me.scaleFactor;
            }
        };

        me.contextPhantom.transM2P = function (p) {
            return me.context.transM2P(p);
        };

        me.contextPhantom.transP2M = function (p) {
            return me.context.transP2M(p);
        };

        me.context.getExtent = function () {
            var me = this, lt = me.transP2M([0, 0]), rb = me.transP2M([me.canvas.clientWidth, me.canvas.clientHeight]);
            return [lt[0], lt[1], rb[0], rb[1]];
        };

    },

    draw: function () {
        var me = this, context = me.context, phantom = me.contextPhantom, ext = context.getExtent();
        context.clearRect(ext[0], ext[1], ext[2] - ext[0], ext[3] - ext[1]);
        phantom.clearRect(0, 0, me.canvas.clientWidth, me.canvas.clientHeight);
        me.context.setTransform(
            this.scaleFactor, 0, 0, this.scaleFactor,
            me.canvas.clientWidth * 0.5 + this.panX * this.scaleFactor,
            me.canvas.clientHeight * 0.5 + this.panY * this.scaleFactor);
        me.forVisibles(function (k, v) {
            v.update();
            context.save();
            try {
                if (me.selection[v.id]) {
                    v.drawSelected(context);
                    if (v.showLabel) {
                        v.drawLabel(phantom);
                    }
                } else {
                    if (v.hidden) {
                        context.globalAlpha = 0.3;
                    }
                    v.draw(context);
                }
                if (v.showLabel) {
                    v.drawLabel(phantom);
                }
            } finally {
                context.restore();
            }
        });

        if (me.hovering) {
            context.save();
            try {
                context.shadowBlur = 5;
                context.shadowColor = "#000";
                me.hovering.drawHovering(context);
                if (me.hovering.showLabel) {
                    me.hovering.drawLabel(phantom);
                }
            } finally {
                context.restore();
            }
        }
    },

    hitTest: function (x, y, radius) {
        var me = this, po, pos, mini = [], minid = 1e300, min0, mind0, min1, mind1, sf = me.scaleFactor,
            temp, p, currd, d, res = {
                found: [],
                current: [ NaN, NaN ]
            };
        radius = radius || me.mouse[2];
        radius = me.context.transP2M(radius);
        sf = radius * radius;
        me.forVisibles(function (k, v) {
            if (v.hitTest(x, y, radius)) {
                p = v.getPosition(v.nearestArg(x, y));
                if (Geom.dist2(p, [x, y]) < sf) {
                    res.found.push({
                        obj: v,
                        x: p[0],
                        y: p[1]
                    });
                }
            }
        });
        if (res.found.length == 0) {
            res.current[0] = x;
            res.current[1] = y;
            res.found = [];
        } else if (res.found.length == 1) {
            res.current[0] = res.found[0].x;
            res.current[1] = res.found[0].y;
            res.found = [ res.found[0].obj ];
        } else {
            po = null;
            $.each(res.found, function (k, v) {
                if (v.obj.isPoint) {
                    po = v.obj;
                    return false;
                }
                return undefined;
            });
            if (po) {
                res.found = [ po ];
                pos = po.getPosition();
                res.current[0] = pos[0];
                res.current[1] = pos[1];
            } else {
                min0 = null, mind0 = Infinity;
                min1 = null, mind1 = Infinity;
                $.each(res.found, function (k, curr) {
                    currd = Geom.dist2([ x, y ], [ curr.x, curr.y ]);
                    if (currd < mind1) {
                        min1 = curr;
                        mind1 = currd;
                        if (mind1 < mind0) {
                            temp = min0;
                            min0 = min1;
                            min1 = temp;
                            temp = mind0;
                            mind0 = mind1;
                            mind1 = temp;
                        }
                    }
                });
                res.found = [ min0.obj, min1.obj ];
                mini = [NaN, NaN, 0];
                minid = Infinity;
                $.each(min0.obj.inters(min1.obj), function (k, v) {
                    d = Geom.dist2(v, [ x, y ]);
                    if (d < minid) {
                        minid = d;
                        mini = [v[0], v[1], k];
                    }
                });
                res.current = mini;
            }
        }
        return res;
    },

    get: function (key) {
        var me = this;
        return me.lines[key] || me.points[key];
    },

    /**
     * @param {Geom} obj
     */
    add: function (obj) {
        var me = this;
        if (obj.isPoint) {
            me.points[obj.id] = obj;
        } else {
            me.lines[obj.id] = obj;
        }
        $.each(obj.getParents(), function (k, v) {
            v.__children[obj.id] = obj;
        });
        obj.dirt();
        obj.update(me);
    },

    /**
     * @param {Geom} obj
     */
    del: function (obj) {
        var me = this;
        if (obj.isPoint) {
            delete me.points[obj.id];
        } else {
            delete me.lines[obj.id];
        }

        if (me.selection[obj.id]) {
            delete me.selection[obj.id];
        }

        if (me.hovering == obj) {
            me.hovering = null;
        }
        $.each(obj.getParents(), function (k, v) {
            delete v.__children[obj.id];
        });
    },

    /**
     * @param {Object} json
     */
    load: function (json) {
        var me = this;
        me.points = {};
        me.lines = {};
        $.each(json.entities, function (k, v) {
            var obj = gb.geom[v.type](me);
            obj.load(v.data, me);
            me.add(obj);
        });
        me.title = json.title;
        me.__nextId = json.nextId;
        me.showHidden = json.showHidden;
        me.cmdStack = [];
        me.cmdStackPos = 0;
        me.draw();
        me.refreshMenu();
        me.selection = {};
        me.panX = json.panX || 0;
        me.panY = json.panY || 0;
        me.scaleFactor = json.scaleFactor || 1;
    },

    save: function () {
        var result = {
            title: this.title,
            nextId: this.__nextId,
            showHidden: this.showHidden,
            entities: [],
            panX: this.panX,
            panY: this.panY,
            scaleFactor: this.scaleFactor
        };
        this.topoFor(function (k, v) {
            result.entities.push({
                type: v.type(),
                data: v.save()
            });
        });
        if (window.localStorage) {
            window.localStorage[gb.localStoragePrefix + this.title] = gb.json.encode(result);
            var files = $.map(gb.docs, function (doc) {
                return doc.title;
            });
            window.localStorage[gb.localStoragePrefix + 'files'] = gb.json.encode(files);
        }
    },

    /**
     *
     * @param {function(string,Geom,GDoc)} callback
     */

    forEntities: function (callback) {
        var me = this;
        $.each(me.lines, function (k, v) {
            return callback(k, v, me);
        });
        $.each(me.points, function (k, v) {
            return callback(k, v, me);
        });
    },

    /**
     *
     * @param {function(string,Geom,GDoc)} callback
     */
    forVisibles: function (callback) {
        if (this.showHidden) {
            this.forEntities(callback);
            return;
        }
        var me = this;
        $.each(me.lines, function (k, v) {
            if (v.hidden) {
                return true;
            }
            return callback(k, v, me);
        });
        $.each(me.points, function (k, v) {
            if (v.hidden) {
                return true;
            }
            return callback(k, v, me);
        });
    },

    /**
     *
     * @param {function(string,Geom,GDoc)} callback
     */
    topoFor: function (callback) {
        var me = this, q, qi, curr, parent = {}, top = {};

        me.forEntities(function (k, v) {
            var pats = v.getParents();
            if ((parent[v.id] = pats.length) == 0) {
                top[v.id] = v;
            }
        });

        q = [];
        $.each(top, function (k, v) {
            q.push(v);
        });
        qi = 0;
        while (qi < q.length) {
            curr = q[qi++];
            callback(curr.id, curr, me);
            $.each(curr.__children, function (k, v) {
                parent[v.id]--;
                if (parent[v.id] == 0) {
                    q.push(v);
                }
            });
        }
        return q;
    },

    run: function (cmd) {
        var me = this;
        if (cmd.canDo(me)) {
            cmd.exec(me);
            me.cmdStack.length = me.cmdStackPos++;
            me.cmdStack.push(cmd);
            me.draw();
            me.refreshMenu();
            me.save();
        }
    },

    canUndo: function () {
        return this.cmdStackPos > 0;
    },

    undo: function () {
        var me = this, cmd;
        if (me.canUndo()) {
            cmd = me.cmdStack[me.cmdStackPos - 1];
            cmd.undo(me);
            --me.cmdStackPos;
            me.draw();
            me.refreshMenu();
            me.save();
        }
    },

    canRedo: function () {
        return this.cmdStackPos < this.cmdStack.length;
    },

    lastCommand: function () {
        return this.cmdStack[this.cmdStackPos - 1];
    },

    redo: function () {
        var me = this, cmd;
        if (me.canRedo()) {
            cmd = me.cmdStack[me.cmdStackPos];
            cmd.redo(me);
            me.cmdStackPos++;
            me.draw();
            me.refreshMenu();
            me.save();
        }
    },

    refreshMenu: function () {
        var me = this;
        $('li.sub-item').each(function (k, item) {
            if (!item.action.isEnabled || item.action.isEnabled(me)) {
                $(item).removeClass('disabled');
            } else {
                $(item).addClass('disabled');
            }
        });
    },

    zoom: function (factor, center) {
        center = center || [0, 0];
        this.context.scale(factor, factor);
        this.panX += (center[0] - this.canvas.clientWidth * 0.5) * (1 / factor - 1) / this.scaleFactor;
        this.panY += (center[1] - this.canvas.clientHeight * 0.5) * (1 / factor - 1) / this.scaleFactor;
        this.scaleFactor *= factor;
        this.draw();
        this.save();
    },

    zoomIn: function () {
        this.zoom(1.1, [0, 0]);
    },

    zoomOut: function () {
        this.zoom(1 / 1.1, [0, 0]);
    },

    zoomRestore: function () {
        this.scaleFactor = 1;
        this.panX = 0;
        this.panY = 0;
        this.draw();
        this.save();
    },

    /**
     * @param {Number} dx
     * @param {Number} dy
     */
    pan: function (dx, dy) {
        this.panX += dx / this.scaleFactor;
        this.panY += dy / this.scaleFactor;
        this.draw();
        this.save();
    },

    active: function () {
        var me = this;
        $('canvas').removeClass('active');
        $('#page-header li').removeClass('active');
        $(me.canvas).add(me.canvasPhantom).addClass('active');
        $(me.pageHeader).addClass('active');
        gb.currentDoc = this;
        if (window.localStorage) {
            window.localStorage[gb.localStoragePrefix + 'currentDocument'] = this.title;
        }
        me.resize($('#area').width(), $('#area').height());
    },

    resize: function (w, h) {
        var me = this, context = me.context;
        $(me.canvas).add(me.canvasPhantom).attr('width', w).attr('height', h);
        context.translate(me.panX + w * 0.5, me.panY + h * 0.5);
        context.scale(me.scaleFactor, me.scaleFactor);
        me.forEntities(function (k, v) {
            v.dirt();
        });
        me.draw();
    },

    rename: function (newName) {
        if (window.localStorage) {
            delete window.localStorage[this.title];
        }
        this.title = newName;
        this.save();
    }
};
