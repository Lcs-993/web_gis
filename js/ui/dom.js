/* Criação de elementos sem innerHTML: todo texto entra como textContent. */

export function el(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);

    Object.entries(attributes).forEach(([key, value]) => {
        if (value === null || value === undefined || value === false) {
            return;
        }

        if (key === "class") {
            element.className = value;
        } else if (key === "text") {
            element.textContent = value;
        } else if (key === "dataset") {
            Object.assign(element.dataset, value);
        } else if (key.startsWith("on") && typeof value === "function") {
            element.addEventListener(key.slice(2), value);
        } else if (key in element && typeof value !== "string") {
            element[key] = value;
        } else {
            element.setAttribute(key, value === true ? "" : value);
        }
    });

    (Array.isArray(children) ? children : [children]).forEach((child) => {
        if (child === null || child === undefined || child === false) {
            return;
        }

        element.appendChild(
            typeof child === "string" || typeof child === "number"
                ? document.createTextNode(String(child))
                : child
        );
    });

    return element;
}

export const byId = (id) => document.getElementById(id);
