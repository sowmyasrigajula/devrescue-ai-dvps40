export function createOrderHandler(requestBody) {
  return {
    status: 201,
    body: {
      orderId: "ord_1001",
      total: requestBody.total
    }
  };
}
