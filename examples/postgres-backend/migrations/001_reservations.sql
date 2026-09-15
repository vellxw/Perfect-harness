CREATE TABLE reservations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot text NOT NULL UNIQUE CHECK (length(slot) BETWEEN 1 AND 40),
  customer text NOT NULL CHECK (length(customer) BETWEEN 1 AND 120)
);
