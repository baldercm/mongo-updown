mongo-updown is an opinionated MongoDB migration tool featuring:

- up/down scripts
- version aware
- written in TypeScript

## Basic usage

Install in your project as npm devDependency:

```shell
npm i -D mongo-updown
```

Create defautl configuration file:

```shell
npx mongo-updown init
```

Run migration:

```shell
npm i -D mongo-updown up <version> <file?>
```

Rollback migration:

```shell
npm i -D mongo-updown down <version> <file?>
```
