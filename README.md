# Food_agriculture_supply_chain

# Deployed Contracts

1. Add the following to the .env file

```
POLYGON_RPC_URL=
PRIVATE_KEY=
POLYGONSCAN_API_KEY=
```

2. Pull the dependencies

```
yarn install
```

3. Run the deploy script

Local

```
yarn hardhat deploy
```

Polygon

```
yarn hardhat deploy --network polygon
```