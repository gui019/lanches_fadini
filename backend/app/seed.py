from sqlalchemy import select

from .models import AddOn, Product

PRODUCTS = [
    (
        "classico-salada",
        "Clássico Salada",
        2800,
        "Hambúrguer VPJ Angus, queijo prato, molho da casa e salada.",
        ["Pão brioche", "Hambúrguer VPJ Angus", "Queijo prato", "Molho da casa", "Alface", "Tomate"],
        "Leve no nome. Gigante no sabor.",
    ),
    (
        "classico-burguer",
        "Clássico Burguer",
        2600,
        "Hambúrguer VPJ Angus, queijo prato e maionese Hellmann’s.",
        ["Pão brioche", "Hambúrguer VPJ Angus", "Queijo prato", "Maionese Hellmann’s"],
        "O essencial, bem feito",
    ),
    (
        "king-bbq",
        "King BBQ",
        3800,
        "Hambúrguer VPJ Angus, queijo prato, anéis de cebola e molho barbecue.",
        ["Pão brioche", "Hambúrguer VPJ Angus", "Queijo prato", "Anéis de cebola", "Molho barbecue"],
        "Para quem ama barbecue",
    ),
    (
        "classico-bacon",
        "Clássico Bacon",
        3200,
        "Hambúrguer VPJ Angus, queijo prato, bacon e maionese Hellmann’s.",
        ["Pão brioche", "Hambúrguer VPJ Angus", "Queijo prato", "Bacon", "Maionese Hellmann’s"],
        "Bacon é sempre uma boa ideia",
    ),
    (
        "ultimat-burguer",
        "Ultimat Burguer",
        3600,
        "Hambúrguer VPJ Angus, cheddar, Catupiry, bacon, cebola roxa caramelizada e maionese Hellmann’s.",
        [
            "Pão brioche",
            "Hambúrguer VPJ Angus",
            "Cheddar",
            "Catupiry",
            "Bacon",
            "Cebola roxa caramelizada",
            "Maionese Hellmann’s",
        ],
        "O encontro perfeito",
    ),
    (
        "x-turbo",
        "X-Turbo",
        4000,
        "Todos os ingredientes da casa em um lanche para quem quer ir além.",
        [
            "Pão brioche",
            "Hambúrguer VPJ Angus",
            "Queijo prato",
            "Cheddar",
            "Catupiry",
            "Bacon",
            "Cebola roxa caramelizada",
            "Alface",
            "Tomate",
            "Anéis de cebola",
            "Molho barbecue",
            "Maionese Hellmann’s",
        ],
        "Todos os ingredientes!",
    ),
]
ADD_ONS = [
    ("hamburguer", "Hambúrguer VPJ 180 g", 700),
    ("salada", "Salada", 250),
    ("cebola", "Cebola caramelizada", 300),
    ("bacon", "Bacon", 400),
    ("queijo", "Queijo prato", 250),
    ("cheddar", "Cheddar", 300),
    ("catupiry", "Catupiry", 300),
]


def seed(db):
    if not db.scalar(select(Product.id).limit(1)):
        for pid, name, price, description, ingredients, badge in PRODUCTS:
            db.add(
                Product(
                    id=pid,
                    name=name,
                    price=price,
                    description=description,
                    ingredients=ingredients,
                    badge=badge,
                    image=f"/images/{pid}.webp",
                )
            )
    if not db.scalar(select(AddOn.id).limit(1)):
        for aid, name, price in ADD_ONS:
            db.add(AddOn(id=aid, name=name, price=price))
    db.commit()
