# Demo App

## Usage

```js
const media = require("./providers/media/media-provider.js");
import "somelib/dist/styles.css";
```

```dockerfile
COPY --from=build /home/node/app/dist ./
CMD ["node", "dist/app.js"]
```

See the [contributing guide](docs/CONTRIBUTING.md) before opening a PR.
