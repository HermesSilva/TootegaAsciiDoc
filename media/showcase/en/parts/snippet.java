package showcase;

public final class Snippet {
    // tag::main[]
    public static int add(int a, int b) {
        return a + b; // only this method enters the document (tag=main)
    }
    // end::main[]

    public static void main(String[] args) {
        System.out.println(add(2, 3));
    }
}
