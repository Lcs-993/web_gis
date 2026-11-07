/* Emissor de eventos mínimo: on/off/emit, sem dependências. */

export function createEmitter() {
    const handlers = new Map();

    const on = (type, handler) => {
        if (!handlers.has(type)) {
            handlers.set(type, new Set());
        }

        handlers.get(type).add(handler);

        return () => off(type, handler);
    };

    const off = (type, handler) => {
        const set = handlers.get(type);

        if (set) {
            set.delete(handler);
        }
    };

    const emit = (type, payload) => {
        const set = handlers.get(type);

        if (!set) {
            return;
        }

        /* Cópia: um handler pode se desinscrever durante o emit. */
        Array.from(set).forEach((handler) => {
            try {
                handler(payload);
            } catch (error) {
                console.error(`[webgis] erro no handler de "${type}"`, error);
            }
        });
    };

    return { on, off, emit };
}
