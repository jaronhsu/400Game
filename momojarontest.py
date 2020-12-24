import random

class Card(object):
    def __init__(self, suit, val):
        self.suit = suit
        self.value = val

    def Output(self):
        print("{} of {}".format(self.value, self.suit))

class Deck(object):
    def __init__(self):
        self.Cards = []
        self.Build()

    def Build(self):
        for i in ["H", "D", "S", "C"]:
            for j in range(1, 14):
                self.Cards.append(Card(i, j))
        random.shuffle(self.Cards)

    def Output(self):
        for i in self.Cards:
            i.Output()

    def DrawCard(self):
        return self.Cards.pop()

class Player(object):
    def __init__(self, name):
        self.name = name
        self.Hand = []
    
    def Draw(self, Deck):
        self.Hand.append(Deck.DrawCard())
    
    def OutputHand(self):
        for card in self.Hand:
            card.Output()


###################################        Main/Testing         ################################################

Test1 = Card("Spades", 8)
Test1.Output()

Test2 = Deck()
Test2.DrawCard()
Test2.DrawCard()
Test2.Output()

Test3 = Player("Jaron")
Test3.Draw(Test2)
Test3.Draw(Test2)
Test3.OutputHand()

Test2.Output()
