package exemplo;

public final class Trecho {
    // tag::principal[]
    public static int soma(int a, int b) {
        return a + b; // só este método entra no documento (tag=principal)
    }
    // end::principal[]

    public static void main(String[] args) {
        System.out.println(soma(2, 3));
    }
}
