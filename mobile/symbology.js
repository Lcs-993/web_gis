/* ============================================================
   SIMBOLOGIA DAS CAMADAS (folha "Estilo")

   Monta os controles de estilo de uma camada: símbolo único,
   categorias ou graduado, cores, contorno, opacidade e tamanho
   do ponto. As mudanças são aplicadas pelo contexto recebido:

   ctx = {
       modeAttributes(layer, mode), rebuildTheme(layer),
       refresh(layer), save(), setSwatch(layer, color),
       formatNumber(value, digits)
   }
   ============================================================ */

function section(title) {
    const element = document.createElement("section");
    element.className = "style-section";
    const heading = document.createElement("h2");
    heading.className = "style-section-title";
    heading.textContent = title;
    element.append(heading);
    return element;
}

function row(label, control) {
    const element = document.createElement("label");
    element.className = "style-field-row";
    const text = document.createElement("span");
    text.textContent = label;
    element.append(text, control);
    return element;
}

function colorInput(value, disabled, onInput, onChange) {
    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    input.disabled = disabled;
    input.addEventListener("input", () => onInput(input.value));
    input.addEventListener("change", onChange);
    return input;
}

function rangeInput({ value, min, max, step, format, onInput, onChange }) {
    const control = document.createElement("span");
    control.className = "style-range-control";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const output = document.createElement("output");
    output.textContent = format(value);
    input.addEventListener("input", () => {
        const number = Number(input.value);
        output.textContent = format(number);
        onInput(number);
    });
    input.addEventListener("change", onChange);
    control.append(input, output);
    return control;
}

function legendRow(color, text, count, ctx) {
    const element = document.createElement("div");
    element.className = "legend-row";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = color;
    const label = document.createElement("span");
    label.textContent = text;
    const total = document.createElement("span");
    total.className = "legend-count";
    total.textContent = ctx.formatNumber(count, 0);
    element.append(swatch, label, total);
    return element;
}

function legend(layer, ctx) {
    const element = document.createElement("div");
    element.className = "theme-legend";
    for (const item of layer.theme.classes) {
        const text = layer.theme.kind === "numeric"
            ? `${ctx.formatNumber(item.min)} – ${ctx.formatNumber(item.max)}`
            : item.key;
        element.append(legendRow(item.color, text, item.count, ctx));
    }
    if (layer.theme.empty) {
        element.append(legendRow(layer.theme.empty.color, "Sem valor", layer.theme.empty.count, ctx));
    }
    return element;
}

export function renderStyleControls(container, layer, ctx) {
    const rerender = () => renderStyleControls(container, layer, ctx);
    const changeTheme = () => {
        ctx.rebuildTheme(layer);
        ctx.refresh(layer);
        ctx.save();
        rerender();
    };
    container.replaceChildren();

    const byKind = {
        category: ctx.modeAttributes(layer, "category"),
        numeric: ctx.modeAttributes(layer, "numeric")
    };

    const typeSection = section("Estilo");
    const mode = document.createElement("select");
    mode.setAttribute("aria-label", "Tipo de simbologia");
    for (const [value, label, enabled] of [
        ["single", "Símbolo único", true],
        ["category", "Categorias", byKind.category.length > 0],
        ["numeric", "Graduado", byKind.numeric.length > 0]
    ]) {
        const option = new Option(label, value, false, layer.style.mode === value);
        option.disabled = !enabled;
        mode.append(option);
    }
    mode.addEventListener("change", () => {
        layer.style.mode = mode.value;
        if (mode.value !== "single" && !byKind[mode.value].some((item) => item.name === layer.style.field)) {
            layer.style.field = byKind[mode.value][0]?.name || "";
        }
        changeTheme();
    });
    typeSection.append(row("Tipo", mode));

    if (layer.style.mode !== "single") {
        const field = document.createElement("select");
        field.setAttribute("aria-label", "Atributo da simbologia");
        for (const attribute of byKind[layer.style.mode]) {
            field.append(new Option(attribute.name, attribute.name, false, layer.style.field === attribute.name));
        }
        field.addEventListener("change", () => {
            layer.style.field = field.value;
            changeTheme();
        });
        typeSection.append(row("Atributo", field));
        if (layer.theme) typeSection.append(legend(layer, ctx));
    }
    container.append(typeSection);

    const isPoint = layer.geometryKind === "point";
    const themed = layer.style.mode !== "single";
    const symbolSection = section("Símbolo");
    symbolSection.append(row("Cor", colorInput(layer.style.color, themed, (color) => {
        layer.style.color = color;
        ctx.refresh(layer);
        ctx.setSwatch(layer, color);
    }, ctx.save)));
    if (themed) {
        const hint = document.createElement("p");
        hint.className = "style-help";
        hint.textContent = "As cores são definidas pelos valores do atributo escolhido.";
        symbolSection.append(hint);
    }

    if (!isPoint) {
        const fill = document.createElement("input");
        fill.type = "checkbox";
        fill.checked = layer.style.fill;
        fill.addEventListener("change", () => {
            layer.style.fill = fill.checked;
            ctx.refresh(layer);
            ctx.save();
            rerender();
        });
        const fillLabel = document.createElement("label");
        fillLabel.className = "style-check";
        fillLabel.append(fill, document.createTextNode("Preenchimento"));
        symbolSection.append(fillLabel);
    }
    if (layer.style.fill || isPoint) {
        symbolSection.append(row("Opacidade do preenchimento", rangeInput({
            value: layer.style.fillOpacity,
            min: 0,
            max: 1,
            step: 0.05,
            format: (value) => `${Math.round(value * 100)}%`,
            onInput: (value) => { layer.style.fillOpacity = value; ctx.refresh(layer); },
            onChange: ctx.save
        })));
        symbolSection.append(row("Cor do contorno", colorInput(layer.style.strokeColor, false, (color) => {
            layer.style.strokeColor = color;
            ctx.refresh(layer);
        }, ctx.save)));
    }
    symbolSection.append(row("Espessura do contorno", rangeInput({
        value: layer.style.strokeWidth,
        min: 0,
        max: 8,
        step: 0.1,
        format: (value) => `${ctx.formatNumber(value, 1)} px`,
        onInput: (value) => { layer.style.strokeWidth = value; ctx.refresh(layer); },
        onChange: ctx.save
    })));
    if (isPoint) {
        symbolSection.append(row("Tamanho do ponto", rangeInput({
            value: layer.style.pointSize,
            min: 2,
            max: 20,
            step: 1,
            format: (value) => `${value} px`,
            onInput: (value) => { layer.style.pointSize = value; ctx.refresh(layer); },
            onChange: ctx.save
        })));
    }
    container.append(symbolSection);

    const renderSection = section("Renderização da camada");
    renderSection.append(row("Opacidade", rangeInput({
        value: layer.style.opacity,
        min: 0,
        max: 1,
        step: 0.05,
        format: (value) => `${Math.round(value * 100)}%`,
        onInput: (value) => { layer.style.opacity = value; ctx.refresh(layer); },
        onChange: ctx.save
    })));
    container.append(renderSection);
}
