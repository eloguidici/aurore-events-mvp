# 🖼️ Cómo Ver los Diagramas Mermaid Visualmente

Los diagramas en `DIAGRAMAS_UML.md` están escritos en código Mermaid. Para verlos como gráficos visuales, usa una de estas opciones:

---

## ⚡ Opción Más Rápida: Mermaid Live Editor

1. **Ve a**: https://mermaid.live/
2. **Abre** `docs/DIAGRAMAS_UML.md` en tu editor
3. **Copia** el código de un diagrama (desde ` ```mermaid` hasta ` ``` `)
4. **Pega** el código en https://mermaid.live/
5. **¡Listo!** Verás el diagrama renderizado como gráfico

**Ejemplo:**
- Abre `docs/DIAGRAMAS_UML.md`
- Encuentra el primer diagrama (líneas 9-72)
- Copia desde ````mermaid` hasta el siguiente ```` 
- Pega en https://mermaid.live/

---

## 🔌 VS Code: Extensión Recomendada

### Opción A: Markdown Preview Mermaid Support (Recomendada)

1. Abre VS Code
2. Presiona `Ctrl+Shift+X` (o `Cmd+Shift+X` en Mac)
3. Busca: **`Markdown Preview Mermaid Support`**
4. Instala (por `bierner.markdown-mermaid`)
5. Abre `docs/DIAGRAMAS_UML.md`
6. Presiona `Ctrl+Shift+V` (Preview de Markdown)
7. Los diagramas se renderizan automáticamente

### Opción B: Mermaid Preview

1. Instala extensión: **`Mermaid Preview`** (por `vstirbu.vscode-mermaid-preview`)
2. Abre `docs/DIAGRAMAS_UML.md`
3. Presiona `F1` → escribe "Mermaid: Preview"
4. Verás el diagrama renderizado

### Opción C: Markdown Preview Enhanced

1. Instala extensión: **`Markdown Preview Enhanced`** (por `shd101wyy.markdown-preview-enhanced`)
2. Abre `docs/DIAGRAMAS_UML.md`
3. Click derecho → "Markdown Preview Enhanced: Open Preview to the Side"
4. Los diagramas se renderizan automáticamente

---

## 🌐 GitHub (Automático)

Si el proyecto está en GitHub:
1. Ve al repositorio en GitHub
2. Abre `docs/DIAGRAMAS_UML.md`
3. **Los diagramas se renderizan automáticamente** como gráficos
4. No necesitas hacer nada más

---

## 📄 Editores Online de Markdown

### Dillinger.io
1. Ve a: https://dillinger.io/
2. Copia el contenido de `docs/DIAGRAMAS_UML.md`
3. Pega en el editor
4. Los diagramas Mermaid se renderizan automáticamente

### StackEdit
1. Ve a: https://stackedit.io/
2. Importa el archivo o pega el contenido
3. Los diagramas se renderizan automáticamente

---

## 🎯 Resumen de Opciones

| Opción | Dificultad | Ventaja |
|--------|-----------|---------|
| **Mermaid Live Editor** | ⭐ Muy Fácil | Sin instalar nada, rápido |
| **GitHub** | ⭐ Muy Fácil | Automático si está en GitHub |
| **VS Code Extension** | ⭐⭐ Fácil | Integrado en tu editor |
| **Editor Online** | ⭐⭐ Fácil | Funciona desde el navegador |

---

## 💡 Mi Recomendación

**Para una visualización rápida:** https://mermaid.live/

**Para uso diario:** Instala `Markdown Preview Mermaid Support` en VS Code

**Si tienes GitHub:** Solo abre el archivo en GitHub, se renderiza automáticamente
