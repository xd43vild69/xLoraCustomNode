import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "AcademiaSD.MultiLora",
    
    setup() {
        const originalRefresh = app.refreshComboInNodes;
        app.refreshComboInNodes = function() {
            let res;
            if (originalRefresh) res = originalRefresh.apply(this, arguments);
            if (app.graph) {
                for (let node of app.graph._nodes) {
                    if (node.type === "AcademiaSD_MultiLora" && typeof node.fetchLoras === "function") {
                        node.fetchLoras();
                    }
                }
            }
            return res;
        };

        // Atajo global F4: Buscar, centrar y seleccionar el nodo llamado "loras13"
        window.addEventListener("keydown", (e) => {
            if (e.key === "F4" || e.code === "F4") {
                if (!app.graph || !app.graph._nodes) return;

                const targetNode = app.graph._nodes.find(n => (n.title || "").trim().toLowerCase() === "loras13") ||
                                   app.graph._nodes.find(n => n.type === "AcademiaSD_MultiLora" && (n.title || "").toLowerCase().includes("loras13"));

                if (targetNode) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    if (document.activeElement && typeof document.activeElement.blur === "function") {
                        document.activeElement.blur();
                    }

                    if (app.canvas) {
                        if (app.canvas.deselectAllNodes) {
                            app.canvas.deselectAllNodes();
                        } else {
                            app.canvas.selected_nodes = {};
                        }

                        if (app.canvas.selectNode) {
                            app.canvas.selectNode(targetNode, false);
                        } else {
                            app.canvas.selected_nodes = { [targetNode.id]: targetNode };
                        }

                        if (app.canvas.centerOnNode) {
                            app.canvas.centerOnNode(targetNode);
                        } else if (app.canvas.ds && targetNode.pos) {
                            const canvas = app.canvas;
                            canvas.ds.offset[0] = -targetNode.pos[0] + canvas.canvas.width / 2 / canvas.ds.scale;
                            canvas.ds.offset[1] = -targetNode.pos[1] + canvas.canvas.height / 2 / canvas.ds.scale;
                        }

                        if (app.canvas.setDirty) {
                            app.canvas.setDirty(true, true);
                        }
                    }

                    if (app.graph.setDirtyCanvas) {
                        app.graph.setDirtyCanvas(true, true);
                    }
                }
            }
        }, true);
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AcademiaSD_MultiLora") {
            
            const onSerialize = nodeType.prototype.onSerialize;
            nodeType.prototype.onSerialize = function(o) {
                if (onSerialize) onSerialize.apply(this, arguments);
                const dataWidget = this.widgets.find(w => w.name === "lora_data");
                if (dataWidget) {
                    dataWidget.value = JSON.stringify({
                        loras: this.loraState || [],
                        triggers: this.nodeTriggers || ""
                    });
                }
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(o) {
                if (onConfigure) onConfigure.apply(this, arguments);
                const dataWidget = this.widgets.find(w => w.name === "lora_data");
                if (dataWidget && dataWidget.value) {
                    try {
                        const parsed = JSON.parse(dataWidget.value);
                        if (Array.isArray(parsed)) {
                            this.loraState = parsed;
                            this.nodeTriggers = "";
                        } else if (parsed && typeof parsed === "object") {
                            this.loraState = parsed.loras || [];
                            this.nodeTriggers = parsed.triggers || "";
                        }
                    } catch (e) {
                        console.error("[AcademiaSD] Error restoring state:", e);
                    }
                }
                if (this.renderUI) this.renderUI();
                if (this.forceResize) this.forceResize();
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const _this = this;

                const dataWidget = this.widgets.find(w => w.name === "lora_data");
                if (dataWidget) {
                    dataWidget.type = "hidden";
                    dataWidget.computeSize = () => [0, -4]; 
                    dataWidget.draw = function() {}; 
                    dataWidget.serializeValue = () => {
                        return JSON.stringify({
                            loras: _this.loraState || [],
                            triggers: _this.nodeTriggers || ""
                        });
                    };
                }

                if (!this.loraState) {
                    this.loraState = [];
                }

                this.size = [420, 280];
                let loraList = [];

                const container = document.createElement("div");
                container.style.cssText = `
                    width: 100%; display: flex; flex-direction: column; gap: 6px;
                    font-family: sans-serif; box-sizing: border-box; margin-top: 4px;
                    padding-bottom: 6px;
                `;

                const style = document.createElement("style");
                style.innerHTML = `
                    .asd-switch { position: relative; display: inline-block; width: 32px; height: 16px; flex-shrink: 0;}
                    .asd-switch input { opacity: 0; width: 0; height: 0; }
                    .asd-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #555; transition: .2s; border-radius: 16px; }
                    .asd-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 2px; bottom: 2px; background-color: #aaa; transition: .2s; border-radius: 50%; }
                    .asd-switch input:checked + .asd-slider { background-color: #4a6ee0; }
                    .asd-switch input:checked + .asd-slider:before { transform: translateX(16px); background-color: white; }
                    
                    .asd-lora-row { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.3); border: 1px solid #444; border-radius: 6px; padding: 4px 6px; transition: opacity 0.2s; position: relative;}
                    .asd-lora-row.disabled { opacity: 0.5; }
                    
                    .asd-search-container { position: relative; flex: 1; min-width: 0; }
                    .asd-search-input { width: 100%; padding: 4px; border: 1px solid #555; background: #111; color: #ddd; border-radius: 4px; font-size: 12px; outline: none; box-sizing: border-box; cursor: text; text-overflow: ellipsis;}
                    .asd-search-input:focus { border-color: #4a6ee0; background: #1a1a1a; }
                    .asd-search-list { position: absolute; top: 100%; left: 0; right: 0; background: #222; border: 1px solid #555; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 9999; display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.6); margin-top: 2px;}
                    .asd-search-item { padding: 6px 8px; cursor: pointer; color: #ddd; font-size: 11px; word-break: break-all; border-bottom: 1px solid #333;}
                    .asd-search-item:last-child { border-bottom: none; }
                    .asd-search-item:hover { background: #4a6ee0; color: #fff; }
                    .asd-search-item.missing { color: #ff4444; font-weight: bold; }

                    .asd-step-btn { background: transparent; border: none; color: #888; font-size: 14px; font-weight: bold; cursor: pointer; padding: 0 4px; transition: color 0.2s; user-select: none; }
                    .asd-step-btn:hover { color: #fff; }
                `;
                container.appendChild(style);

                if (this.nodeTriggers === undefined) {
                    this.nodeTriggers = "";
                }

                // --- CAJA DE TEXTO PARA TRIGGER WORDS (UNA SOLA LÍNEA) ---
                const txtTriggers = document.createElement("input");
                txtTriggers.type = "text";
                txtTriggers.placeholder = "Trigger words (ej: 1girl, sakura, pink hair)...";
                txtTriggers.style.cssText = "width: 100%; height: 26px; min-height: 26px; flex-shrink: 0; padding: 4px 8px; border: 1px solid #444; background: #0d0d0d; color: #eee; border-radius: 4px; font-size: 11px; font-family: inherit; outline: none; box-sizing: border-box; transition: border-color 0.2s; text-overflow: ellipsis;";
                txtTriggers.onfocus = () => { txtTriggers.style.borderColor = "#4a6ee0"; };
                txtTriggers.onblur = () => { txtTriggers.style.borderColor = "#444"; };
                txtTriggers.value = _this.nodeTriggers || "";

                txtTriggers.addEventListener("input", (e) => {
                    _this.nodeTriggers = e.target.value;
                    syncWidget();
                });

                container.appendChild(txtTriggers);

                const topBar = document.createElement("div");
                topBar.style.display = "flex"; 
                topBar.style.justifyContent = "space-between";
                topBar.style.alignItems = "center";
                topBar.style.padding = "0 2px";
                
                const toggleAllContainer = document.createElement("div");
                toggleAllContainer.style.display = "flex"; 
                toggleAllContainer.style.alignItems = "center"; 
                toggleAllContainer.style.gap = "8px";
                
                const labelToggleAll = document.createElement("label");
                labelToggleAll.className = "asd-switch";
                const inputToggleAll = document.createElement("input");
                inputToggleAll.type = "checkbox";
                inputToggleAll.checked = true;
                const spanSliderAll = document.createElement("span");
                spanSliderAll.className = "asd-slider";
                labelToggleAll.appendChild(inputToggleAll);
                labelToggleAll.appendChild(spanSliderAll);
                
                const textToggleAll = document.createElement("span");
                textToggleAll.innerText = "Toggle All";
                textToggleAll.style.cssText = "color: #ccc; font-size: 11px; font-weight: bold;";
                
                toggleAllContainer.appendChild(labelToggleAll);
                toggleAllContainer.appendChild(textToggleAll);

                const btnRefresh = document.createElement("button");
                btnRefresh.innerText = "🔄 Refresh List";
                btnRefresh.style.cssText = "cursor: pointer; background: transparent; color: #888; border: none; font-size: 10px;";
                
                topBar.appendChild(toggleAllContainer);
                topBar.appendChild(btnRefresh);
                container.appendChild(topBar);

                this.rowsContainer = document.createElement("div");
                this.rowsContainer.style.display = "flex";
                this.rowsContainer.style.flexDirection = "column";
                this.rowsContainer.style.gap = "4px"; 
                container.appendChild(this.rowsContainer);

                const btnAdd = document.createElement("button");
                btnAdd.innerText = "➕ Add Lora";
                btnAdd.style.cssText = "cursor: pointer; padding: 6px; background: rgba(255,255,255,0.05); color: #aaa; border: 1px solid #444; border-radius: 6px; font-weight: bold; margin-top: 4px; font-size: 11px; transition: background 0.2s;";
                btnAdd.onmouseover = () => btnAdd.style.background = "rgba(255,255,255,0.1)";
                btnAdd.onmouseout = () => btnAdd.style.background = "rgba(255,255,255,0.05)";
                container.appendChild(btnAdd);

                const MIN_WIDTH = 420;

                this.computeSize = function(out) {
                    const numRows = _this.loraState ? _this.loraState.length : (_this.rowsContainer ? _this.rowsContainer.children.length : 0);
                    // Encabezado del canvas: título (30) + 3 slots (66) + injection_method (28) = ~124px
                    const canvasTopH = 124;
                    // Contenido HTML: input 1 línea (26+6) + topBar (22+6) + rows (numRows * 34) + btnAdd (30+4) + padding (6) = 100 + (numRows * 34)px
                    const domH = 100 + (numRows * 34);
                    const currentW = Math.max(_this.size ? _this.size[0] : 0, MIN_WIDTH);
                    return [currentW, canvasTopH + domH];
                };

                const originalOnResize = this.onResize;
                this.onResize = function(size) {
                    if (originalOnResize) originalOnResize.apply(this, arguments);
                    const minSize = this.computeSize();
                    if (size[0] < minSize[0]) size[0] = minSize[0];
                    if (size[1] < minSize[1]) size[1] = minSize[1];
                };

                const forceResize = () => {
                    const applySize = () => {
                        const minSize = _this.computeSize();
                        const currentW = Math.max(_this.size ? _this.size[0] : 0, MIN_WIDTH);
                        _this.size = [currentW, minSize[1]];
                        if (typeof _this.setSize === "function") {
                            _this.setSize([currentW, minSize[1]]);
                        }
                        app.graph.setDirtyCanvas(true, true);
                    };
                    applySize();
                    setTimeout(applySize, 30);
                };
                this.forceResize = forceResize;

                // --- NUEVA ARQUITECTURA DE DATOS REACTIVA ---
                const syncWidget = () => {
                    if (dataWidget) {
                        dataWidget.value = JSON.stringify({
                            loras: _this.loraState || [],
                            triggers: _this.nodeTriggers || ""
                        });
                    }
                    if (_this.properties) {
                        _this.properties.triggers = _this.nodeTriggers || "";
                    }
                    app.graph.setDirtyCanvas(true, false);
                };

                const moveLora = (fromIdx, toIdx) => {
                    if (toIdx < 0 || toIdx >= _this.loraState.length) return;
                    const item = _this.loraState.splice(fromIdx, 1)[0];
                    _this.loraState.splice(toIdx, 0, item);
                    syncWidget();
                    _this.renderUI();
                };

                const checkToggleAll = () => {
                    if (_this.loraState.length === 0) return;
                    let allChecked = true;
                    let allUnchecked = true;
                    _this.loraState.forEach(l => {
                        if (l.enabled) allUnchecked = false;
                        else allChecked = false;
                    });
                    if (allChecked) inputToggleAll.checked = true;
                    else if (allUnchecked) inputToggleAll.checked = false;
                };

                inputToggleAll.addEventListener("change", (e) => {
                    const state = e.target.checked;
                    _this.loraState.forEach(l => l.enabled = state);
                    syncWidget();
                    _this.renderUI();
                });

                this.fetchLoras = async function() {
                    try {
                        const res = await fetch("/academia/lora_list");
                        loraList = await res.json();
                        _this.renderUI();
                    } catch (e) {}
                };

                let hoverTimeout;
                const handleTooltipEnter = (e, loraName) => {
                    if (!loraName || loraName === "None" || loraName.includes("(Missing)")) return;
                    
                    hoverTimeout = setTimeout(async () => {
                        let loraTooltip = document.getElementById("asd-lora-tooltip");
                        if (!loraTooltip) return;

                        loraTooltip.style.display = "block";
                        loraTooltip.style.left = (e.clientX + 15) + "px";
                        loraTooltip.style.top = (e.clientY + 15) + "px";

                        if (window.loraMetadataCache && window.loraMetadataCache[loraName]) {
                            loraTooltip.innerText = window.loraMetadataCache[loraName];
                            return;
                        }

                        loraTooltip.innerText = "⏳ Loading metadata...";
                        try {
                            const res = await fetch("/academia/lora_info", {
                                method: "POST", headers: {"Content-Type": "application/json"},
                                body: JSON.stringify({name: loraName})
                            });
                            const jsonRes = await res.json();
                            if(!window.loraMetadataCache) window.loraMetadataCache = {};
                            window.loraMetadataCache[loraName] = jsonRes.info;
                            
                            if (loraTooltip.style.display === "block") {
                                loraTooltip.innerText = jsonRes.info;
                            }
                        } catch(e) {
                            loraTooltip.innerText = "❌ Error loading metadata.";
                        }
                    }, 400); 
                };

                const handleTooltipMove = (e) => {
                    let loraTooltip = document.getElementById("asd-lora-tooltip");
                    if(loraTooltip) {
                        loraTooltip.style.left = (e.clientX + 15) + "px";
                        loraTooltip.style.top = (e.clientY + 15) + "px";
                    }
                };

                const handleTooltipLeave = () => {
                    clearTimeout(hoverTimeout);
                    let loraTooltip = document.getElementById("asd-lora-tooltip");
                    if(loraTooltip) loraTooltip.style.display = "none";
                };

                this.renderUI = () => {
                    if (txtTriggers && txtTriggers.value !== (_this.nodeTriggers || "")) {
                        txtTriggers.value = _this.nodeTriggers || "";
                    }
                    _this.rowsContainer.innerHTML = "";

                    _this.loraState.forEach((item, idx) => {
                        const row = document.createElement("div");
                        row.className = "asd-lora-row";
                        row.style.zIndex = 1000 - idx; 
                        
                        const isEnabled = item.enabled !== undefined ? item.enabled : true;
                        if(!isEnabled) row.classList.add("disabled");

                        const labelToggle = document.createElement("label");
                        labelToggle.className = "asd-switch";
                        const inputToggle = document.createElement("input");
                        inputToggle.type = "checkbox";
                        inputToggle.className = "lora-toggle";
                        inputToggle.checked = isEnabled;
                        const spanSlider = document.createElement("span");
                        spanSlider.className = "asd-slider";
                        labelToggle.appendChild(inputToggle);
                        labelToggle.appendChild(spanSlider);

                        const searchContainer = document.createElement("div");
                        searchContainer.className = "asd-search-container";

                        const inputSearch = document.createElement("input");
                        inputSearch.type = "text";
                        inputSearch.className = "asd-search-input";
                        inputSearch.placeholder = "Type to search LoRA...";
                        inputSearch.value = item.name || "";

                        const dropdownList = document.createElement("div");
                        dropdownList.className = "asd-search-list";

                        const populateDropdown = (filterText) => {
                            dropdownList.innerHTML = "";
                            const lowerFilter = filterText.toLowerCase();
                            let matchCount = 0;

                            const currentVal = inputSearch.value;
                            if (currentVal && !loraList.includes(currentVal) && currentVal !== "None") {
                                const opt = document.createElement("div");
                                opt.className = "asd-search-item missing";
                                opt.innerText = currentVal + " (Missing/Pending)";
                                opt.addEventListener("mousedown", () => {
                                    inputSearch.value = currentVal;
                                    dropdownList.style.display = "none";
                                    _this.loraState[idx].name = currentVal;
                                    syncWidget();
                                });
                                dropdownList.appendChild(opt);
                            }

                            loraList.forEach(loraName => {
                                if (loraName.toLowerCase().includes(lowerFilter)) {
                                    const opt = document.createElement("div");
                                    opt.className = "asd-search-item";
                                    opt.innerText = loraName;
                                    
                                    opt.addEventListener("mouseenter", (e) => handleTooltipEnter(e, loraName));
                                    opt.addEventListener("mousemove", handleTooltipMove);
                                    opt.addEventListener("mouseleave", handleTooltipLeave);

                                    opt.addEventListener("mousedown", () => {
                                        inputSearch.value = loraName;
                                        dropdownList.style.display = "none";
                                        _this.loraState[idx].name = loraName;
                                        syncWidget();
                                    });
                                    dropdownList.appendChild(opt);
                                    matchCount++;
                                }
                            });

                            if (matchCount === 0) {
                                const noRes = document.createElement("div");
                                noRes.style.cssText = "padding: 6px 8px; color: #777; font-size: 11px; text-align: center;";
                                noRes.innerText = "No matches found";
                                dropdownList.appendChild(noRes);
                            }
                        };

                        inputSearch.addEventListener("focus", () => {
                            populateDropdown(""); 
                            dropdownList.style.display = "block";
                            row.style.zIndex = 2000; 
                        });

                        inputSearch.addEventListener("input", (e) => {
                            populateDropdown(e.target.value);
                            dropdownList.style.display = "block";
                            _this.loraState[idx].name = e.target.value;
                            syncWidget();
                        });

                        inputSearch.addEventListener("blur", () => {
                            row.style.zIndex = 1000 - idx;
                            setTimeout(() => { dropdownList.style.display = "none"; }, 150);
                        });

                        inputSearch.addEventListener("mouseenter", (e) => {
                            if(dropdownList.style.display !== "block") handleTooltipEnter(e, inputSearch.value);
                        });
                        inputSearch.addEventListener("mousemove", handleTooltipMove);
                        inputSearch.addEventListener("mouseleave", handleTooltipLeave);

                        searchContainer.appendChild(inputSearch);
                        searchContainer.appendChild(dropdownList);

                        const strengthContainer = document.createElement("div");
                        strengthContainer.style.cssText = "display: flex; align-items: center; background: rgba(0,0,0,0.4); border-radius: 4px; padding: 0 2px;";

                        const btnMinus = document.createElement("button");
                        btnMinus.innerText = "-";
                        btnMinus.className = "asd-step-btn";

                        const inputStrength = document.createElement("input");
                        inputStrength.type = "text";  
                        inputStrength.className = "lora-strength";
                        
                        let initialValue = parseFloat(item.strength !== undefined ? item.strength : 1.0);
                        if (isNaN(initialValue)) initialValue = 1.0;
                        inputStrength.value = initialValue.toFixed(2);
                        
                        inputStrength.style.cssText = "width: 40px; padding: 4px 0; border: none; background: transparent; color: white; outline: none; text-align: center; font-family: monospace; font-size: 13px; font-weight: bold;";

                        const btnPlus = document.createElement("button");
                        btnPlus.innerText = "+";
                        btnPlus.className = "asd-step-btn";

                        const adjustValue = (amount) => {
                            let val = parseFloat(inputStrength.value);
                            if (isNaN(val)) val = 0.0;
                            val += amount;
                            inputStrength.value = val.toFixed(2);
                            _this.loraState[idx].strength = val;
                            syncWidget();
                        };

                        btnMinus.addEventListener("click", () => adjustValue(-0.05));
                        btnPlus.addEventListener("click", () => adjustValue(0.05));

                        inputStrength.addEventListener("input", function() {
                            this.value = this.value.replace(/,/g, '.');
                            this.value = this.value.replace(/(?!^-)[^0-9.]/g, '');
                            if ((this.value.match(/\./g) || []).length > 1) {
                                this.value = this.value.slice(0, -1);
                            }
                        });

                        inputStrength.addEventListener("focus", function() {
                            this.style.background = "rgba(74, 110, 224, 0.4)";
                            this.style.borderRadius = "3px";
                            this.select();
                        });

                        inputStrength.addEventListener("keydown", function(e) {
                            if (e.key === "ArrowUp") {
                                e.preventDefault();
                                adjustValue(e.shiftKey ? 0.2 : 0.05);
                            } else if (e.key === "ArrowDown") {
                                e.preventDefault();
                                adjustValue(e.shiftKey ? -0.2 : -0.05);
                            } else if (e.key === "Enter") {
                                this.blur();
                            }
                        });

                        inputStrength.addEventListener("blur", function() {
                            this.style.background = "transparent";
                            let parsed = parseFloat(this.value);
                            if (isNaN(parsed)) parsed = 0.0;
                            this.value = parsed.toFixed(2);
                            _this.loraState[idx].strength = parsed;
                            syncWidget();
                        });

                        strengthContainer.appendChild(btnMinus);
                        strengthContainer.appendChild(inputStrength);
                        strengthContainer.appendChild(btnPlus);

                        const btnDelete = document.createElement("button");
                        btnDelete.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>`;
                        btnDelete.style.cssText = "background: transparent; border: none; color: #666; cursor: pointer; padding: 0 0 0 4px; display: flex; align-items: center; transition: color 0.2s;";
                        btnDelete.onmouseover = () => btnDelete.style.color = "#ff4444";
                        btnDelete.onmouseout = () => btnDelete.style.color = "#666";
                        
                        inputToggle.addEventListener("change", (e) => {
                            _this.loraState[idx].enabled = e.target.checked;
                            if(e.target.checked) row.classList.remove("disabled");
                            else row.classList.add("disabled");
                            syncWidget();
                            checkToggleAll();
                        });
                        
                        btnDelete.addEventListener("click", () => {
                            _this.loraState.splice(idx, 1);
                            syncWidget();
                            _this.renderUI();
                        });

                        // Botones para reordenar arriba/abajo
                        const orderContainer = document.createElement("div");
                        orderContainer.style.cssText = "display: flex; flex-direction: column; justify-content: center; gap: 1px; margin: 0 1px;";

                        const btnUp = document.createElement("button");
                        btnUp.type = "button";
                        btnUp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>`;
                        btnUp.title = "Subir (Move Up)";
                        btnUp.style.cssText = `background: transparent; border: none; color: ${idx === 0 ? '#333' : '#777'}; cursor: ${idx === 0 ? 'default' : 'pointer'}; padding: 1px 2px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: color 0.15s;`;
                        if (idx > 0) {
                            btnUp.onmouseover = () => btnUp.style.color = "#fff";
                            btnUp.onmouseout = () => btnUp.style.color = "#777";
                            btnUp.addEventListener("click", () => moveLora(idx, idx - 1));
                        }

                        const btnDown = document.createElement("button");
                        btnDown.type = "button";
                        btnDown.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
                        btnDown.title = "Bajar (Move Down)";
                        const isLast = idx === _this.loraState.length - 1;
                        btnDown.style.cssText = `background: transparent; border: none; color: ${isLast ? '#333' : '#777'}; cursor: ${isLast ? 'default' : 'pointer'}; padding: 1px 2px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: color 0.15s;`;
                        if (!isLast) {
                            btnDown.onmouseover = () => btnDown.style.color = "#fff";
                            btnDown.onmouseout = () => btnDown.style.color = "#777";
                            btnDown.addEventListener("click", () => moveLora(idx, idx + 1));
                        }

                        orderContainer.appendChild(btnUp);
                        orderContainer.appendChild(btnDown);

                        // Click derecho sobre la fila para mostrar menú contextual (estilo Power Lora Loader rgthree)
                        row.addEventListener("contextmenu", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.LiteGraph && window.LiteGraph.ContextMenu) {
                                const canMoveUp = idx > 0;
                                const canMoveDown = idx < _this.loraState.length - 1;
                                new LiteGraph.ContextMenu([
                                    {
                                        content: "⬆️ Move Up",
                                        disabled: !canMoveUp,
                                        callback: () => moveLora(idx, idx - 1)
                                    },
                                    {
                                        content: "⬇️ Move Down",
                                        disabled: !canMoveDown,
                                        callback: () => moveLora(idx, idx + 1)
                                    },
                                    null,
                                    {
                                        content: isEnabled ? "⚫ Desactivar" : "🟢 Activar",
                                        callback: () => {
                                            _this.loraState[idx].enabled = !isEnabled;
                                            syncWidget();
                                            _this.renderUI();
                                        }
                                    },
                                    {
                                        content: "🗑️ Remove",
                                        callback: () => {
                                            _this.loraState.splice(idx, 1);
                                            syncWidget();
                                            _this.renderUI();
                                        }
                                    }
                                ], {
                                    event: e,
                                    title: item.name ? item.name.split(/[/\\]/).pop() : "LoRA Options"
                                });
                            }
                        });

                        row.appendChild(labelToggle);
                        row.appendChild(searchContainer);
                        row.appendChild(strengthContainer);
                        row.appendChild(orderContainer);
                        row.appendChild(btnDelete);
                        
                        _this.rowsContainer.appendChild(row);
                    });

                    checkToggleAll();
                    forceResize();
                }; 

                btnAdd.addEventListener("click", () => {
                    const defaultName = loraList.length > 0 ? loraList[0] : "";
                    _this.loraState.push({ enabled: true, name: defaultName, strength: 1.0 });
                    syncWidget();
                    _this.renderUI();
                });
                
                btnRefresh.addEventListener("click", () => _this.fetchLoras());

                container.addEventListener("mousedown", (e) => e.stopPropagation());
                this.addDOMWidget("UI", "HTML", container);
                
                if(!window.loraMetadataCache) window.loraMetadataCache = {};
                let globalTooltip = document.getElementById("asd-lora-tooltip");
                if (!globalTooltip) {
                    globalTooltip = document.createElement("div");
                    globalTooltip.id = "asd-lora-tooltip";
                    globalTooltip.style.cssText = `
                        position: fixed; background: rgba(20, 20, 20, 0.95); color: #fff; 
                        border: 1px solid #555; padding: 10px; border-radius: 6px; 
                        z-index: 999999; display: none; pointer-events: none; 
                        font-family: monospace; font-size: 13px; line-height: 1.4;
                        white-space: pre-wrap; max-width: 400px; box-shadow: 0 4px 10px rgba(0,0,0,0.6);
                        backdrop-filter: blur(4px);
                    `;
                    document.body.appendChild(globalTooltip);
                }

                // --- ACCESOS DIRECTOS DE TECLADO ---
                const onKeyDownCapture = (e) => {
                    if (!_this.graph) return;
                    const isSelected = app.canvas && app.canvas.selected_nodes && app.canvas.selected_nodes[_this.id];
                    if (!isSelected) return;

                    // Option / Alt + número (1..9) enfoca el campo de fuerza del LoRA correspondiente
                    if (e.altKey && !e.ctrlKey && !e.metaKey) {
                        let digit = -1;
                        if (e.code && e.code.startsWith("Digit")) {
                            digit = parseInt(e.code.replace("Digit", ""));
                        } else if (e.key >= "0" && e.key <= "9") {
                            digit = parseInt(e.key);
                        }

                        if (digit >= 1 && digit <= 9) {
                            const loraIdx = digit - 1;
                            if (_this.rowsContainer && _this.rowsContainer.children[loraIdx]) {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();

                                const targetRow = _this.rowsContainer.children[loraIdx];
                                const strengthInput = targetRow.querySelector(".lora-strength");
                                if (strengthInput) {
                                    strengthInput.focus();
                                    strengthInput.select();
                                }
                            }
                        } else if (digit === 0) {
                            // Option + 0 enfoca la caja de trigger words
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            if (txtTriggers) {
                                txtTriggers.focus();
                                txtTriggers.select();
                            }
                        }
                    }
                };

                window.addEventListener("keydown", onKeyDownCapture, true);

                const origOnRemoved = this.onRemoved;
                this.onRemoved = function() {
                    window.removeEventListener("keydown", onKeyDownCapture, true);
                    if (origOnRemoved) origOnRemoved.apply(this, arguments);
                };

                // INICIALIZACIÓN
                this.fetchLoras().then(() => {
                    if (dataWidget && dataWidget.value) {
                        try {
                            const savedData = JSON.parse(dataWidget.value);
                            if (Array.isArray(savedData)) {
                                _this.loraState = savedData;
                                _this.nodeTriggers = "";
                            } else if (savedData && typeof savedData === "object") {
                                _this.loraState = savedData.loras || [];
                                _this.nodeTriggers = savedData.triggers || "";
                            }
                            if (txtTriggers) {
                                txtTriggers.value = _this.nodeTriggers || "";
                            }
                        } catch (e) {}
                    }
                    _this.renderUI();
                    if (_this.forceResize) _this.forceResize();
                });
            };
        }
    }
});