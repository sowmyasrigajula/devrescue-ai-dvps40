import { createOrder } from "../controllers/orderController.js";

export const orderRoutes = [
  {
    method: "POST",
    path: "/orders",
    handler: createOrder
  }
];
