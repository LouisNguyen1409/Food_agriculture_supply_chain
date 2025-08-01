

To run contract
Terminal 1:
1. npx hardhat node

Terminal 2:
1. npx hardhat deploy --tags clean

To create and check product:

Connect metamask address 1 on chrome:

Terminal 2:
1. node scripts/register-farmer.js (remember to check script and change address)
2. Go to frontend create and verify product

To create and check shipment:
Terminal 2: 
1. Use product address from previous step and run node scripts/register-processor-update-product-state.js (rmb to change address on script accordingly). This will update the product to PROCESSING step for address 3 from node

Frontend:
2. Connect metamask address 2 on chrome
3. Creat shipment with previous product
4. Verify shipment


