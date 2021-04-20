# ts-transformer-svg-jsx

Transform SVG import into JSX.

## Installation

## Usage

Use with [ttypescript](https://github.com/cevek/ttypescript).

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "ts-transformer-svg-jsx/transform", "svgo": {} }]
  }
}
```

Use with [Babel](https://babeljs.io/).

```json
{
  "plugins": [["ts-transformer-svg-jsx/babel", { "svgo": {} }]]
}
```

Example:

```tsx
import { svgToJsx } from "ts-transformer-svg-jsx";

const CloseIcon = svgToJsx("./close.svg");

function CloseButton() {
  return (
    <button>
      <CloseIcon />
      Close
    </button>
  );
}
```

## License

MIT
