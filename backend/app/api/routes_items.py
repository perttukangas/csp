from fastapi import APIRouter, HTTPException

from app.models.item import Item

router = APIRouter(prefix='/items', tags=['items'])

# Fake in-memory database
items_db: dict[int, Item] = {}
counter = 0


@router.post('/', response_model=Item)
def create_item(item: Item):
    global counter
    counter += 1
    items_db[counter] = item
    return item


@router.get('/{item_id}', response_model=Item)
def get_item(item_id: int):
    if item_id not in items_db:
        raise HTTPException(status_code=404, detail='Item not found')
    return items_db[item_id]
