import { Halin } from "./src/halin";

const app = new Halin();

app.get("/", (req, res) => {
  res.json({ message: "Hello from Halin!" });
});

app.listen(3001, () => {
  console.log("Server running at http://localhost:3001");
});
