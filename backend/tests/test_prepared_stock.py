def test_admin_cancel_after_preparation_does_not_restock_cooked_food(admin, create):
    create()
    order = admin.get("/api/v1/admin/orders").json()["orders"][0]
    path = f"/api/v1/admin/orders/{order['id']}"
    assert admin.patch(path, json={"status": "confirmed", "estimate": "20h30"}).status_code == 200
    assert admin.patch(path, json={"status": "preparing"}).status_code == 200
    assert admin.patch(path, json={"status": "cancelled"}).status_code == 200
    assert admin.get("/api/v1/catalog").json()["stock"]["available"] == 39
