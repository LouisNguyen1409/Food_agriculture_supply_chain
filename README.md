# Food_agriculture_supply_chain
backend
npx hardhat node --network hardhat

npx hardhat run deploy/03-clean-deploy.js --network localhost

frontend:
script farmer: scripts: register-stakeholder.js
npm start

npx hardhat deploy --tags clean

node scripts/register-stakeholder.js

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