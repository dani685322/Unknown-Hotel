import { BLUEPRINT_LIMITS, BLUEPRINT_NODE_TYPES, normalizeBlueprint } from '../core/BlueprintGraph.js';
import { escapeHtml } from '../core/escapeHtml.js';

function createNodeId() {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sceneReferences(scene) {
  const doors = scene.doors ?? [];
  const nearObjects = [...doors, ...(scene.triggers ?? [])];
  const objects = [...(scene.rooms ?? []), ...(scene.meshes ?? []), ...(scene.lights ?? []), ...(scene.spawns ?? []), ...nearObjects];
  return {
    objectIds: new Set(objects.map((item) => item.id)),
    doorIds: new Set(doors.map((item) => item.id)),
    nearObjectIds: new Set(nearObjects.map((item) => item.id)),
    animationIds: new Set((scene.animations ?? []).map((item) => item.id)),
  };
}

export class BlueprintEditor {
  constructor(root, scene, onChange, onError = () => {}) {
    this.root = root;
    this.scene = scene;
    this.onChange = onChange;
    this.onError = onError;
    this.blueprint = normalizeBlueprint(scene.blueprint, sceneReferences(scene));
    this.renderShell();
    this.renderGraph();
  }

  renderShell() {
    this.root.innerHTML = `<section class="blueprint-workspace" aria-label="Blueprint graph editor">
      <div class="blueprint-toolbar"><span>Right-click the graph to search for nodes. Click an output pin, then an input pin to connect.</span>
        <button type="button" data-clear-connection>Cancel connection</button>
      </div>
      <div class="blueprint-canvas-wrap" data-graph-wrap>
        <div class="blueprint-canvas" data-graph-canvas>
          <svg class="blueprint-wires" viewBox="0 0 1600 900" aria-hidden="true"></svg>
          <div class="blueprint-nodes" data-graph-nodes></div>
        </div>
        <div class="blueprint-node-picker" data-node-picker hidden>
          <label>Search nodes<input type="search" data-node-search autocomplete="off" placeholder="Type a node name"></label>
          <div data-node-results></div>
        </div>
      </div>
      <p class="blueprint-status" data-blueprint-status role="status">No code required. Only approved nodes can run.</p>
    </section>`;
    this.canvas = this.root.querySelector('[data-graph-canvas]');
    this.nodesRoot = this.root.querySelector('[data-graph-nodes]');
    this.wires = this.root.querySelector('.blueprint-wires');
    this.picker = this.root.querySelector('[data-node-picker]');
    this.search = this.root.querySelector('[data-node-search]');
    this.results = this.root.querySelector('[data-node-results]');
    this.root.querySelector('[data-clear-connection]').addEventListener('click', () => {
      this.connectionStart = null;
      this.setStatus('Connection cancelled.');
    });
    this.canvas.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.blueprint-node')) return;
      event.preventDefault();
      this.openPicker(event);
    });
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('pointerdown', (event) => this.startNodeDrag(event));
    this.root.addEventListener('pointermove', (event) => this.moveNode(event));
    this.root.addEventListener('pointerup', (event) => this.finishNodeDrag(event));
    this.root.addEventListener('scroll', () => this.renderWires(), true);
    this.search.addEventListener('input', () => this.renderNodeResults());
    document.addEventListener('pointerdown', this.onOutsidePointer = (event) => {
      if (!this.picker.hidden && !this.picker.contains(event.target) && !this.canvas.contains(event.target)) this.closePicker();
    });
    window.addEventListener('resize', this.onResize = () => this.renderWires());
  }

  setScene(scene) {
    this.scene = scene;
    this.blueprint = normalizeBlueprint(scene.blueprint, sceneReferences(scene));
    this.renderGraph();
  }

  setStatus(message) {
    const status = this.root.querySelector('[data-blueprint-status]');
    if (status) status.textContent = message;
  }

  openPicker(event) {
    const wrap = this.root.querySelector('[data-graph-wrap]');
    const bounds = this.canvas.getBoundingClientRect();
    this.pendingPosition = {
      x: Math.max(12, Math.min(1400, event.clientX - bounds.left + wrap.scrollLeft)),
      y: Math.max(12, Math.min(760, event.clientY - bounds.top + wrap.scrollTop)),
    };
    const wrapBounds = wrap.getBoundingClientRect();
    this.picker.style.left = `${Math.max(8, event.clientX - wrapBounds.left + wrap.scrollLeft)}px`;
    this.picker.style.top = `${Math.max(8, event.clientY - wrapBounds.top + wrap.scrollTop)}px`;
    this.picker.hidden = false;
    this.search.value = '';
    this.renderNodeResults();
    this.search.focus();
  }

  closePicker() {
    this.picker.hidden = true;
  }

  renderNodeResults() {
    const query = this.search.value.trim().toLowerCase();
    const matches = Object.entries(BLUEPRINT_NODE_TYPES).filter(([type, definition]) =>
      (type !== 'action-play-animation' || this.scene.animations?.length)
      && `${definition.title} ${definition.category}`.toLowerCase().includes(query));
    this.results.innerHTML = matches.map(([type, definition]) => `
      <button type="button" data-add-node="${escapeHtml(type)}">
        <span>${escapeHtml(definition.category)}</span><b>${escapeHtml(definition.title)}</b>
      </button>`).join('') || '<p>No matching nodes.</p>';
  }

  handleClick(event) {
    const addButton = event.target.closest('[data-add-node]');
    if (addButton) {
      this.addNode(addButton.dataset.addNode);
      return;
    }
    const removeButton = event.target.closest('[data-remove-node]');
    if (removeButton) {
      this.removeNode(removeButton.dataset.removeNode);
      return;
    }
    const pin = event.target.closest('[data-node-id][data-pin][data-direction]');
    if (pin) this.selectPin(pin);
    if (!this.picker.hidden && !this.picker.contains(event.target) && !this.canvas.contains(event.target)) this.closePicker();
  }

  handleChange(event) {
    const input = event.target.closest('[data-node-property]');
    if (!input) return;
    const node = this.blueprint.nodes.find((item) => item.id === input.dataset.nodeId);
    if (!node) return;
    node.properties[input.dataset.nodeProperty] = input.value;
    this.commit('Node settings updated.');
  }

  handleInput(event) {
    if (event.target.matches('[data-node-search]')) this.renderNodeResults();
  }

  selectPin(pin) {
    const current = {
      nodeId: pin.dataset.nodeId,
      pin: pin.dataset.pin,
      direction: pin.dataset.direction,
      type: pin.dataset.pinType,
    };
    if (current.direction === 'output') {
      this.connectionStart = current;
      this.setStatus(`Select a compatible input for ${this.blueprint.nodes.find((node) => node.id === current.nodeId)?.type ?? 'node'}.`);
      return;
    }
    if (!this.connectionStart) {
      this.setStatus('Select an output pin first.');
      return;
    }
    if (this.connectionStart.type !== current.type) {
      this.setStatus('Those pins have incompatible types.');
      return;
    }
    const edges = [...this.blueprint.edges.filter((edge) => !(edge.to.nodeId === current.nodeId && edge.to.pin === current.pin)), {
      from: { nodeId: this.connectionStart.nodeId, pin: this.connectionStart.pin },
      to: { nodeId: current.nodeId, pin: current.pin },
    }];
    try {
      this.blueprint = normalizeBlueprint({ ...this.blueprint, edges }, sceneReferences(this.scene));
      this.connectionStart = null;
      this.commit('Nodes connected.');
    } catch (error) {
      this.onError(error.message);
    }
  }

  addNode(type) {
    const definition = BLUEPRINT_NODE_TYPES[type];
    if (!definition || this.blueprint.nodes.length >= BLUEPRINT_LIMITS.nodes) {
      this.onError(`The graph cannot contain more than ${BLUEPRINT_LIMITS.nodes} nodes.`);
      return;
    }
    const properties = {};
    if (type === 'condition-door-locked') properties.targetId = this.scene.doors?.[0]?.id ?? '';
    if (type === 'condition-player-near-object') properties.targetId = [...(this.scene.doors ?? []), ...(this.scene.triggers ?? [])][0]?.id ?? '';
    if (type === 'action-show-message' || type === 'action-complete') properties.value = '';
    if (type === 'action-play-animation') properties.animationId = this.scene.animations?.[0]?.id ?? '';
    this.blueprint.nodes.push({
      id: createNodeId(),
      type,
      x: this.pendingPosition?.x ?? 40,
      y: this.pendingPosition?.y ?? 40,
      properties,
    });
    this.closePicker();
    this.commit(`${definition.title} added.`);
  }

  removeNode(id) {
    this.blueprint.nodes = this.blueprint.nodes.filter((node) => node.id !== id);
    this.blueprint.edges = this.blueprint.edges.filter((edge) => edge.from.nodeId !== id && edge.to.nodeId !== id);
    if (this.connectionStart?.nodeId === id) this.connectionStart = null;
    this.commit('Node removed.');
  }

  startNodeDrag(event) {
    if (event.button !== 0) return;
    const header = event.target.closest('[data-node-drag]');
    if (!header || event.target.closest('button, input, select')) return;
    const node = this.blueprint.nodes.find((item) => item.id === header.dataset.nodeId);
    if (!node) return;
    this.dragState = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  moveNode(event) {
    if (!this.dragState) return;
    const node = this.blueprint.nodes.find((item) => item.id === this.dragState.id);
    const element = this.nodesRoot.querySelector(`[data-node-card="${CSS.escape(this.dragState.id)}"]`);
    if (!node || !element) return;
    node.x = Math.max(0, Math.min(1450, this.dragState.nodeX + event.clientX - this.dragState.startX));
    node.y = Math.max(0, Math.min(820, this.dragState.nodeY + event.clientY - this.dragState.startY));
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    this.renderWires();
  }

  finishNodeDrag() {
    if (!this.dragState) return;
    this.dragState = null;
    this.commit('Node moved.');
  }

  nodeProperties(node) {
    if (node.type === 'condition-door-locked') return this.objectSelect(node, 'targetId', this.scene.doors ?? [], 'Door');
    if (node.type === 'condition-player-near-object') return this.objectSelect(node, 'targetId', [...(this.scene.doors ?? []), ...(this.scene.triggers ?? [])], 'Door or trigger');
    if (node.type === 'action-show-message' || node.type === 'action-complete') {
      return `<label class="blueprint-node-property">Message<input data-node-id="${escapeHtml(node.id)}" data-node-property="value" maxlength="120" value="${escapeHtml(node.properties.value ?? '')}"></label>`;
    }
    if (node.type === 'action-play-animation') {
      const options = (this.scene.animations ?? []).map((animation, index) => `<option value="${escapeHtml(animation.id)}" ${animation.id === node.properties.animationId ? 'selected' : ''}>${escapeHtml(animation.name || `Animation ${index + 1}`)}</option>`).join('');
      return `<label class="blueprint-node-property">Animation<select data-node-id="${escapeHtml(node.id)}" data-node-property="animationId"><option value="">Choose animation</option>${options}</select></label>`;
    }
    return '';
  }

  objectSelect(node, property, objects, label) {
    const options = objects.map((item, index) => `<option value="${escapeHtml(item.id)}" ${item.id === node.properties[property] ? 'selected' : ''}>${escapeHtml(`${label} ${index + 1}`)}</option>`).join('');
    return `<label class="blueprint-node-property">Target<select data-node-id="${escapeHtml(node.id)}" data-node-property="${property}"><option value="">Choose target</option>${options}</select></label>`;
  }

  renderGraph() {
    this.nodesRoot.replaceChildren();
    this.blueprint.nodes.forEach((node) => {
      const definition = BLUEPRINT_NODE_TYPES[node.type];
      const card = document.createElement('article');
      card.className = `blueprint-node blueprint-node-${definition.category.toLowerCase()}`;
      card.dataset.nodeCard = node.id;
      card.style.left = `${node.x}px`;
      card.style.top = `${node.y}px`;
      const inputs = Object.entries(definition.inputs).map(([pin, type]) => `
        <button type="button" class="blueprint-pin input" data-node-id="${escapeHtml(node.id)}" data-pin="${escapeHtml(pin)}" data-direction="input" data-pin-type="${escapeHtml(type)}"><i></i><span>${escapeHtml(pin)}</span></button>`).join('');
      const outputs = Object.entries(definition.outputs).map(([pin, type]) => `
        <button type="button" class="blueprint-pin output" data-node-id="${escapeHtml(node.id)}" data-pin="${escapeHtml(pin)}" data-direction="output" data-pin-type="${escapeHtml(type)}"><span>${escapeHtml(pin)}</span><i></i></button>`).join('');
      card.innerHTML = `<header data-node-drag data-node-id="${escapeHtml(node.id)}"><span>${escapeHtml(definition.category)}</span><b>${escapeHtml(definition.title)}</b><button type="button" data-remove-node="${escapeHtml(node.id)}" aria-label="Remove node">×</button></header>
        <div class="blueprint-node-body">${this.nodeProperties(node)}
          <div class="blueprint-node-pins"><div>${inputs}</div><div>${outputs}</div></div>
        </div>`;
      this.nodesRoot.append(card);
    });
    this.renderWires();
  }

  renderWires() {
    if (!this.wires) return;
    this.wires.replaceChildren();
    const bounds = this.wires.getBoundingClientRect();
    this.blueprint.edges.forEach((edge) => {
      const from = this.nodesRoot.querySelector(`[data-node-id="${CSS.escape(edge.from.nodeId)}"][data-pin="${CSS.escape(edge.from.pin)}"]`);
      const to = this.nodesRoot.querySelector(`[data-node-id="${CSS.escape(edge.to.nodeId)}"][data-pin="${CSS.escape(edge.to.pin)}"]`);
      if (!from || !to) return;
      const source = from.getBoundingClientRect();
      const target = to.getBoundingClientRect();
      const x1 = source.left + source.width / 2 - bounds.left;
      const y1 = source.top + source.height / 2 - bounds.top;
      const x2 = target.left + target.width / 2 - bounds.left;
      const y2 = target.top + target.height / 2 - bounds.top;
      const curve = Math.max(40, Math.abs(x2 - x1) * 0.45);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', edge.from.pin === 'true' ? 'branch-true' : edge.from.pin === 'false' ? 'branch-false' : '');
      this.wires.append(path);
    });
  }

  commit(message) {
    this.blueprint = normalizeBlueprint(this.blueprint, sceneReferences(this.scene));
    this.renderGraph();
    this.setStatus(message);
    this.onChange(structuredClone(this.blueprint));
  }

  serialize() {
    return structuredClone(this.blueprint);
  }

  dispose() {
    document.removeEventListener('pointerdown', this.onOutsidePointer);
    window.removeEventListener('resize', this.onResize);
  }
}
