"""
Basic tests to verify pytest setup and simple functionality
"""

import pytest


def test_basic_math():
    """Test basic mathematical operations"""
    assert 2 + 2 == 4
    assert 10 - 5 == 5
    assert 3 * 4 == 12
    assert 8 / 2 == 4


def test_string_operations():
    """Test basic string operations"""
    text = 'Hello, World!'
    assert text.lower() == 'hello, world!'
    assert text.upper() == 'HELLO, WORLD!'
    assert len(text) == 13
    assert 'World' in text


def test_list_operations():
    """Test basic list operations"""
    numbers = [1, 2, 3, 4, 5]
    assert len(numbers) == 5
    assert numbers[0] == 1
    assert numbers[-1] == 5
    assert sum(numbers) == 15


def test_dict_operations():
    """Test basic dictionary operations"""
    data = {'name': 'John', 'age': 30, 'city': 'New York'}
    assert data['name'] == 'John'
    assert data.get('age') == 30
    assert 'city' in data
    assert 'country' not in data


class TestClassExample:
    """Example test class to demonstrate test organization"""

    def test_class_method_example(self):
        """Test method within a class"""
        assert True

    def test_another_class_method(self):
        """Another test method within a class"""
        result = self.helper_method(5, 3)
        assert result == 8

    def helper_method(self, a, b):
        """Helper method for tests"""
        return a + b


@pytest.mark.parametrize(
    'input_value,expected',
    [
        (1, 2),
        (2, 4),
        (3, 6),
        (4, 8),
        (5, 10),
    ],
)
def test_parameterized_double(input_value, expected):
    """Test parameterized test example"""

    def double(x):
        return x * 2

    assert double(input_value) == expected


def test_exception_handling():
    """Test exception handling"""
    with pytest.raises(ZeroDivisionError):
        _ = 10 / 0


def test_approximate_values():
    """Test approximate value comparison"""
    import math

    assert math.pi == pytest.approx(3.14159, rel=1e-4)
