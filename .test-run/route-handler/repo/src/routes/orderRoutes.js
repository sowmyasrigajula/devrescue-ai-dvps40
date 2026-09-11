import { createOrderHandler } from "../controllers/orderController.js";

export const orderRoutes = [
  {
    method: "POST",
    path: "/orders",
    handler: createOrderHandler
  }
];
