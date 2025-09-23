from pydantic import BaseModel, Field, constr


class Item(BaseModel):
    name: constr(min_length=2, max_length=50)
    price: float = Field(..., gt=0)
    description: str | None = None
    in_stock: bool = True
